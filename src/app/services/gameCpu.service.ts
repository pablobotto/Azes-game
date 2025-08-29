import { Injectable } from '@angular/core';
import { GameService } from './game.service';
import { GameRulesService } from './gameRules.service';
import { Card } from '../models/card.model';
import { GameZone } from '../enum/game-zone.enum';
import { Player } from '../enum/player.enum';
import { resolve } from 'path';
import { DiscardPoints } from '../models/discardPoints.model';

export interface CpuMove {
  fromZone: GameZone;
  toZone: GameZone;
  card: Card;
}

@Injectable({ providedIn: 'root' })
export class CpuAiService {

    constructor(private gameService: GameService, private rulesService: GameRulesService) {}

    async play() {
        const ownDeckTop = this.peekLast(this.gameService.opponentDeck);
        if (!ownDeckTop) return null;

        const hand = this.gameService.opponentHand;
        const ownPiles = this.gameService.opponentPiles;
        const playerPiles = this.gameService.playerPiles;
        const playerDeckTop = this.peekLast(this.gameService.playerDeck);

        var topValues: number[] = [0,0,0,0,0,0,0,0];

        // 1. Si puede bajar la carta del deck directamente
        const stairs = this.gameService.stairs;
        var repitedValues: string[] = [];
        await new Promise(resolve => setTimeout(resolve, 1000)); // pausa 1s
        for (const [i, stair] of this.gameService.stairs.entries()) {
            const stairTop = this.peekLast(stair);
            topValues[i] = !stairTop ? 0 : stairTop.numericValue;
            if (repitedValues.includes(!stairTop ? '0' : stairTop.value)) {
                console.log("Mismo valor de Antes, no voy a intentar con la escalera", i);
                continue;
            }
            repitedValues.push(!stairTop ? '0' : stairTop.value);
            if (this.rulesService.canPlaceOnStair(stair, ownDeckTop)) {
                console.log("Puede colocar la carta del deck", ownDeckTop.id, "en la escalera", i);
                this.gameService.opponentDeck.pop();
                this.gameService.stairs[i].push(ownDeckTop);
                await this.play();
                return;
            }else
            {
                console.log("No puede colocar la carta del deck", ownDeckTop.id, "en la escalera", i);
            }
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log("No puede bajar la carta del deck directamente");

        // 2. Buscar cómo preparar escalera con cartas en mano
        repitedValues = [];
        for (const [i, stair] of this.gameService.stairs.entries()) {
            if (topValues[i] >= ownDeckTop.numericValue) { continue; }
            const stairTop = this.peekLast(stair);
            if (repitedValues.includes(!stairTop ? '0' : stairTop.value)) { continue; }
            repitedValues.push(!stairTop ? '0' : stairTop.value);
            await this.tryPlayRecursive(hand, ownDeckTop, stair);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
     
        /*
        // 3. Intentar liberar pilas (usar carta superior de pila)
        for (const pileTop of piles) {
            if (pileTop && this.rulesService.canPlaceCard(pileTop, stairs, GameZone.Stairs)) {
            return { fromZone: GameZone.OpponentPiles, toZone: GameZone.Stairs, card: pileTop };
            }
        }

        // 4. Bloquear al rival (si conviene)
        if (playerDeckTop) {
            const blockingCard = hand.find(c => this.rulesService.canPlaceCard(c, stairs, GameZone.Stairs) && c.value !== playerDeckTop.value);
            if (blockingCard) {
            return { fromZone: GameZone.OpponentHand, toZone: GameZone.Stairs, card: blockingCard };
            }
        }*/
        return;
    }

    async discard() {
        var movements: DiscardPoints[] = [];
        for (const card of this.gameService.opponentHand) {
            for (let i = 0; i < this.gameService.opponentPiles.length; i++) {
                const movement = await this.evaluateDiscardMovement(card, i);
                movements.push(movement);
            }
        }
        console.log("Movimientos posibles de descarte:", movements);
        let bestMovement = movements[0];
        movements.forEach(m => {
        if (m.points > bestMovement.points) {
            bestMovement = m;
        }});
        const index = this.gameService.opponentHand.findIndex(c => c.id === bestMovement.card.id);
        this.gameService.opponentHand.splice(index, 1);
        this.gameService.opponentPiles[bestMovement.idPile].push(bestMovement.card);
        console.log("Mejor movimiento de descarte:", bestMovement);
    }

    private peekLast(arr: Card[]): Card | null {
        return arr.length > 0 ? arr[arr.length - 1] : null;
    }
    private peekTop(arr: Card[]): Card | null {
        return arr.length > 0 ? arr[0] : null;
    }
    private async tryPlayRecursive(hand: Card[], deckTop: Card, stair: Card[] ): Promise<boolean> {       
        // Primero intento usar cartas de la mano
        var couldPlayInAStair = false;
        for (let i = 0; i < hand.length; i++) {
            const card = hand[i];
            console.log("Carta que intento colocar", hand);
            if (this.rulesService.canPlaceOnStair(stair, card)) {
                // simulo colocar la carta
                hand.splice(i, 1);
                stair.push(card);
                couldPlayInAStair = true;
            
                if (this.rulesService.canPlaceOnStair(stair, deckTop)) {
                    console.log("Puede colocar la carta del deck", deckTop.id, "en la escalera",);
                    stair.push(deckTop);
                    this.gameService.opponentDeck.pop();
                    return true; // ya cumplió el objetivo
                }
                // intento con la siguiente carta
                this.tryPlayRecursive(hand, deckTop, stair);         
                // rollback si no funcionó más adelante
                hand.splice(i, 0, card);
                stair.pop();
            } else
            {
                console.log("No puede colocar carta", card.id, "en la escalera",  i);
            }
        }
        return false; // no pudo cumplir el objetivo
    }
    private async evaluateDiscardMovement(card: Card, idPile: number): Promise<DiscardPoints> {
        let points = 0;

        const cardValue = card.numericValue;
        const pile = this.gameService.opponentPiles[idPile];
        const bottomValue = this.peekLast(pile)?.numericValue

        // 1. Si la carta es mayor a 10 -> +2 puntos
        if (cardValue > 10) {
            points += 2;
        }

        // 2. Si la carta es mayor a la que está en la cima -> negativos
        if (bottomValue && cardValue > bottomValue) {
            points -= (cardValue - bottomValue); 
        }

        // 3. Si forma una escalera inversa (carta más chica que cima, y contigua)
        if (bottomValue && cardValue === bottomValue - 1) {
            points += 3;
        }

        // 4. Si la carta es igual a la cima -> -1
        if (cardValue === bottomValue) {
            points -= 1;
        }

        // 5. Si es menor pero no contigua -> 0 (no sumo nada, solo lo dejo explícito)
        if (bottomValue && cardValue < bottomValue && cardValue !== bottomValue - 1) {
            points += 0;
        }

        return { card: card, idPile: idPile, points: points } as DiscardPoints;
    }
}