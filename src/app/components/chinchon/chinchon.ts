import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { Card } from '../../models/card.model';
import { CardComponent } from '../card/card';
import { SocketService } from '../../services/socket.service';
import { NotificationService } from '../../services/notification.service';

/** Resumen de un jugador al terminar la ronda (todo viene del servidor, aca solo se arma para mostrarlo). */
interface RoundRow { id: string; name: string; isCloser: boolean; melds: Card[][]; loose: Card[]; points: number; delta: number; total: number; }

/** Carta que vuela por encima de la mesa mientras se anima un movimiento. */
interface FlyingCard { card: Card; faceDown: boolean; x0: number; y0: number; x1: number; y1: number; moving: boolean; }
const CARD_W = 60;
const CARD_H = 90;
const FLY_MS = 450;
const SLIDE_MS = 260;
const BACK: Card = { suit: '♠', value: '?', numericValue: 0, id: 'fx-back', faceUp: false };

@Component({
  selector: 'app-chinchon',
  imports: [CommonModule, CardComponent, DragDropModule],
  templateUrl: './chinchon.html',
  styleUrl: './chinchon.scss',
})
export class ChinchonComponent implements OnInit, OnDestroy {
  /** La partida ya termino (hay resultado): no se ofrece seguir con otra ronda. */
  @Input() gameOver = false;

  state$: typeof this.socket.table$;
  opponentName$: typeof this.socket.opponentName$;
  selectedId: string | null = null;
  // orden que le da la persona a su mano arrastrando (solo visual, no viaja al servidor); se reinicia cada ronda
  private order: string[] = [];
  private orderRound = 0;
  private busy = false;
  // cartas ya en su lugar pero ocultas hasta que termina de llegar la que vuela
  hidden = new Set<string>();
  flying: FlyingCard[] = [];
  private moveSub?: Subscription;
  // donde estaba la carta que acabo de descartar yo (despues de confirmarse ya no esta en la mano)
  private discardFrom: { id: string; x: number; y: number } | null = null;

  private static readonly errors: Record<string, string> = {
    not_your_turn: '⚠ No es tu turno',
    wrong_step: '⚠ Ahora toca otra cosa',
    illegal_move: '⚠ Movimiento no permitido',
    cannot_close: '⚠ No podés cerrar: las sueltas tienen que sumar menos de 5',
    deck_empty: '⚠ No quedan cartas para robar',
    offline: '⚠ Sin conexión, intentá de nuevo',
    timeout: '⚠ El servidor no respondió, intentá de nuevo',
  };

  constructor(private socket: SocketService, private notifications: NotificationService, private cd: ChangeDetectorRef) {
    this.state$ = this.socket.table$;
    this.opponentName$ = this.socket.opponentName$;
  }

  ngOnInit() {
    this.moveSub = this.socket.tableMove$.subscribe(e => this.onMove(e));
  }
  ngOnDestroy() { this.moveSub?.unsubscribe(); }

  get me(): string { return this.socket.socketId; }
  get myName(): string { return this.socket.savedName || 'Yo'; }
  rivalId(s: any): string | undefined { return Object.keys(s.hands).find(id => id !== this.me); }

  // Los metodos de la plantilla se llaman en cada pasada de deteccion de cambios: si devolvieran objetos nuevos cada vez,
  // las cartas se volverian a procesar todo el tiempo (y se nota durante el vuelo). Se recuerda el resultado.
  private handMemo: { state: any; order: string[]; hand: Card[] } | null = null;
  private discardMemo: { state: any; card: Card | null } | null = null;

  myHand(s: any): Card[] {
    if (s.round !== this.orderRound) { this.order = []; this.orderRound = s.round; }
    if (this.handMemo && this.handMemo.state === s && this.handMemo.order === this.order) return this.handMemo.hand;
    // mi mano siempre se ve boca arriba, venga como venga marcada
    const hand: Card[] = (s.hands[this.me] ?? []).map((c: Card) => ({ ...c, faceUp: true }));
    const pos = (c: Card) => { const i = this.order.indexOf(c.id); return i === -1 ? 1e9 : i; }; // las nuevas, al final
    hand.sort((a, b) => pos(a) - pos(b));
    this.handMemo = { state: s, order: this.order, hand };
    return hand;
  }
  reorder(event: CdkDragDrop<Card[]>, s: any) {
    const list = [...this.myHand(s)];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    this.order = list.map(c => c.id);
  }
  trackById(_: number, c: Card): string { return c.id; }
  trackByIndex(i: number): number { return i; }
  rivalHand(s: any): Card[] { return s.hands[this.rivalId(s) ?? ''] ?? []; }
  discardTop(s: any): Card | null {
    if (this.discardMemo && this.discardMemo.state === s) return this.discardMemo.card;
    const card = s.discard.length ? { ...s.discard[s.discard.length - 1], faceUp: true } : null;
    this.discardMemo = { state: s, card };
    return card;
  }

  isMyTurn(s: any): boolean { return s.currentPlayerId === this.me; }
  canDraw(s: any): boolean { return this.isMyTurn(s) && s.phase === 'drawing'; }
  canDiscard(s: any): boolean { return this.isMyTurn(s) && s.phase === 'discarding'; }

  private async act(action: { type: string; [k: string]: unknown }, illegalMsg?: string): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    try {
      const res = await this.socket.sendAction(action);
      if (res.error) {
        const msg = res.error === 'illegal_move' && illegalMsg ? illegalMsg : ChinchonComponent.errors[res.error];
        this.notifications.show(msg ?? '⚠ Movimiento no permitido');
      }
      return !res.error;
    } finally {
      this.busy = false;
    }
  }

  draw(s: any, from: 'deck' | 'discard') {
    if (!this.canDraw(s)) {
      this.notifications.show(this.isMyTurn(s) ? ChinchonComponent.errors['wrong_step'] : ChinchonComponent.errors['not_your_turn']);
      return;
    }
    this.act({ type: 'draw', from });
  }
  select(s: any, card: Card) {
    if (!this.canDiscard(s)) {
      if (this.isMyTurn(s) && s.phase === 'drawing') this.notifications.show('⚠ Primero robá una carta (mazo o descarte)');
      return;
    }
    this.selectedId = this.selectedId === card.id ? null : card.id;
  }
  async discard() { await this.useSelected('discard'); }
  async close() { await this.useSelected('close'); }
  private async useSelected(type: 'discard' | 'close') {
    if (!this.selectedId) return;
    const pos = this.centerOf(this.cardEl(this.selectedId));
    this.discardFrom = pos ? { id: this.selectedId, ...pos } : null;
    if (await this.act({ type, cardId: this.selectedId })) this.selectedId = null;
  }
  nextRound() { this.act({ type: 'nextRound' }); }
  iAmReady(s: any): boolean { return (s.ready ?? []).includes(this.me); }

  // Las filas se recuerdan mientras el estado no cambie: si se armaran de nuevo en cada pasada, el arrastre de la colada
  // perderia la carta que se esta moviendo.
  private rowsMemo: { state: any; name: string | null; rows: RoundRow[]; meldIds: string[] } | null = null;
  private rowsOf(s: any, rivalName: string | null) {
    if (this.rowsMemo && this.rowsMemo.state === s && this.rowsMemo.name === rivalName) return this.rowsMemo;
    const last = s.last;
    const rows: RoundRow[] = !last ? [] : Object.keys(s.hands).map(id => {
      const melds: Card[][] = last.melds[id] ?? [];
      const inMeld = new Set(melds.flat().map(c => c.id));
      return {
        id,
        name: id === this.me ? this.myName : (rivalName ?? 'Rival'),
        isCloser: id === last.closerId,
        melds,
        // las que ya se colaron salen de las sueltas (ahora estan en la combinacion de quien cerro)
        loose: (last.hands[id] as Card[]).filter(c => !inMeld.has(c.id) && !last.attached?.[c.id]),
        points: last.loose[id],
        delta: last.delta[id],
        total: s.scores[id],
      };
    }).sort((a: RoundRow, b: RoundRow) => Number(a.id === this.me) - Number(b.id === this.me)); // el nuestro, abajo
    const meldIds = last ? (last.melds[last.closerId] ?? []).map((_: Card[], i: number) => 'meld-' + i) : [];
    this.rowsMemo = { state: s, name: rivalName, rows, meldIds };
    return this.rowsMemo;
  }
  /** Filas del resumen de fin de ronda: combinaciones, sueltas y puntos de cada jugador. */
  roundRows(s: any, rivalName: string | null): RoundRow[] { return this.rowsOf(s, rivalName).rows; }
  /** Ids de las combinaciones de quien cerro: a donde se arrastran las sueltas para colarlas. */
  meldIds(s: any, rivalName: string | null): string[] { return this.rowsOf(s, rivalName).meldIds; }

  /** Quien no cerro puede colar sus sueltas hasta que confirma la ronda (y si no fue un chinchon ni termino la partida). */
  canAttach(s: any): boolean {
    return s.phase === 'roundEnd' && !!s.last && !s.last.chinchon && s.last.closerId !== this.me && !this.iAmReady(s) && !this.gameOver;
  }
  isAttached(s: any, card: Card): boolean { return !!s.last?.attached?.[card.id]; }

  /** Soltar una carta suelta sobre una combinacion de quien cerro: pide la colada (el servidor decide si encaja). */
  async attach(event: CdkDragDrop<Card[]>, s: any) {
    const card: Card | undefined = event.item.data;
    if (!card || event.previousContainer === event.container || !event.container.id.startsWith('meld-')) return;
    const meldIdx = Number(event.container.id.slice('meld-'.length));
    await this.act({ type: 'attach', cardId: card.id, meldIdx }, '⚠ Esa carta no encaja en esa combinación');
  }
  closerName(s: any, rivalName: string | null): string {
    return s.last?.closerId === this.me ? 'Cerraste vos' : `Cerró ${rivalName ?? 'tu rival'}`;
  }

  // ---- Efecto de vuelo: se ve en los dos clientes (roba, levanta del descarte, descarta) ----
  private centerOf(el: Element | null | undefined): { x: number; y: number } | null {
    const r = el?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }
  private cardEl(id: string): HTMLElement | null {
    return Array.from(document.querySelectorAll<HTMLElement>('[data-card-id]')).find(el => el.dataset['cardId'] === id) ?? null;
  }
  private ghost(card: Card, faceDown: boolean, from: { x: number; y: number }, to: { x: number; y: number }): FlyingCard {
    return { card: { ...card, faceUp: true }, faceDown, x0: from.x - CARD_W / 2, y0: from.y - CARD_H / 2, x1: to.x - CARD_W / 2, y1: to.y - CARD_H / 2, moving: false };
  }

  // posicion de cada carta de las dos manos (para que las demas se deslicen cuando entra o sale una)
  private handRects(): Map<string, DOMRect> {
    const rects = new Map<string, DOMRect>();
    document.querySelectorAll<HTMLElement>('.my-hand .slot, .rival-hand app-card').forEach(el => {
      const id = el.dataset['cardId'];
      if (id) rects.set(id, el.getBoundingClientRect());
    });
    return rects;
  }

  /**
   * Cuando entra o sale una carta, la mano se vuelve a centrar y las demas saltarian de golpe. Se las lleva de su
   * lugar anterior al nuevo con una transicion (usa la propiedad `translate`, que no pisa el `transform` del arrastre).
   */
  private slideHands(before: Map<string, DOMRect>) {
    const moved: HTMLElement[] = [];
    document.querySelectorAll<HTMLElement>('.my-hand .slot, .rival-hand app-card').forEach(el => {
      const old = el.dataset['cardId'] ? before.get(el.dataset['cardId']!) : undefined;
      if (!old) return;
      const now = el.getBoundingClientRect();
      const dx = old.left - now.left, dy = old.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.style.transition = 'none';
      el.style.translate = `${dx}px ${dy}px`;
      moved.push(el);
    });
    if (moved.length === 0) return;
    void document.body.offsetHeight; // fija el punto de partida antes de animar
    moved.forEach(el => { el.style.transition = `translate ${SLIDE_MS}ms ease-in-out`; el.style.translate = '0px 0px'; });
    setTimeout(() => moved.forEach(el => { el.style.transition = ''; el.style.translate = ''; }), SLIDE_MS + 40);
  }

  /**
   * Llega el movimiento confirmado (el estado nuevo ya esta aplicado). Todo lo visible se prepara en este mismo
   * instante, antes de que el navegador dibuje: se oculta la carta de destino, las demas se deslizan y la que vuela
   * ya esta en su punto de partida. Asi no hay un cuadro intermedio con la carta "perdida".
   */
  private onMove(e: any) {
    const s = this.socket.table$.value;
    if (!s || !e) return;
    const mine = e.playerId === this.me;
    let destId: string | undefined;
    if (e.kind === 'discard') {
      destId = e.card?.id; // la carta que quedo arriba del descarte
    } else if (e.kind === 'draw') {
      const hand: Card[] = mine ? this.myHand(s) : this.rivalHand(s);
      destId = hand[hand.length - 1]?.id; // la nueva queda al final de la mano
    }
    if (!destId) return;
    const id = destId;
    const ghosts: FlyingCard[] = [];
    try {
      const before = this.handRects();           // como estaba la mesa antes de dibujar el estado nuevo
      this.hidden.add(id);
      this.cd.detectChanges();                   // dibuja el estado nuevo ya (la carta de destino, oculta)
      this.slideHands(before);                   // las demas cartas se deslizan en vez de saltar
      const to = this.centerOf(this.cardEl(id));
      const handPos = this.centerOf(document.querySelector(mine ? '.my-hand' : '.rival-hand'));
      const deckPos = this.centerOf(document.querySelector('.deck-pile app-card') ?? document.querySelector('.deck-pile'));
      const discardPos = this.centerOf(document.querySelector('.discard-pile app-card') ?? document.querySelector('.discard-pile .empty-slot'));
      if (e.kind === 'draw' && to) {
        const from = e.from === 'discard' ? discardPos : deckPos;
        // de mi propio mazo si conozco la carta (esta en mi mano): viaja boca arriba; la del rival, de dorso
        const known: Card | undefined = e.card ?? (mine ? this.myHand(s).find(c => c.id === id) : undefined);
        if (from) ghosts.push(this.ghost(known ?? BACK, !known, from, to));
      } else if (e.kind === 'discard' && to) {
        const own = mine && this.discardFrom?.id === e.card.id ? this.discardFrom : null;
        const from = own ? { x: own.x, y: own.y } : handPos;
        if (from) ghosts.push(this.ghost(e.card, false, from, to));
      }
      if (ghosts.length) {
        this.flying = [...this.flying, ...ghosts];
        this.cd.detectChanges();                 // la carta que vuela ya esta en su lugar de partida en este mismo cuadro
      }
    } catch (err) {
      console.warn('No se pudo preparar el movimiento', err);
    }
    this.fly(ghosts, id);
  }

  /** Mueve las cartas que vuelan y, al terminar, deja todo en su lugar. */
  private async fly(ghosts: FlyingCard[], destId: string) {
    try {
      if (ghosts.length) {
        await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        ghosts.forEach(g => g.moving = true);
        this.cd.detectChanges();
        await new Promise(r => setTimeout(r, FLY_MS + 10));
      }
    } catch (err) {
      console.warn('No se pudo animar el movimiento', err);
    } finally {
      // pase lo que pase la carta tiene que quedar visible
      this.hidden.delete(destId);
      this.flying = this.flying.filter(f => !ghosts.includes(f));
      this.discardFrom = null;
      this.cd.detectChanges();
    }
  }
}
