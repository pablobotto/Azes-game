import { Injectable, NgZone} from '@angular/core';
import { GameService } from './game.service';
import { GameRulesService } from './gameRules.service';
import { Card } from '../models/card.model';
import { GameZone } from '../enum/game-zone.enum';
import { Player } from '../enum/player.enum';
import { DiscardPoints } from '../models/discardPoints.model';

export interface CpuMove {
  fromZone: GameZone;
  toZone: GameZone;
  card: Card;
}

@Injectable({ providedIn: 'root' })
export class CpuAiService {

    constructor(private gameService: GameService, private rulesService: GameRulesService, private ngZone: NgZone) {}

    async play() {
        const ownDeckTop = this.peekLast(this.gameService.opponentDeck);
        if (!ownDeckTop) return null;

        const hand = this.gameService.opponentHand;
        var topValues: number[] = [0,0,0,0,0,0,0,0];

        // 1. Si puede bajar la carta del deck directamente
        var repitedValues: string[] = [];
        await new Promise(resolve => setTimeout(resolve, 1000)); // pausa 1s
        for (const [i, stair] of this.gameService.stairs.entries()) {
            const stairTop = this.peekLast(stair);
            topValues[i] = !stairTop ? 0 : stairTop.numericValue;
            if (repitedValues.includes(!stairTop ? '0' : stairTop.value)) {
                continue;
            }
            repitedValues.push(!stairTop ? '0' : stairTop.value);
            if (await this.rulesService.canPlaceOnStair(stair, ownDeckTop)) {
                this.gameService.opponentDeck.pop();
                this.gameService.stairs[i].push(ownDeckTop);
                await this.play();
                return;
            }
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log("No puede bajar directamente", ownDeckTop);

        // 2. Buscar cómo preparar escalera con cartas en mano
        /*repitedValues = [];
        for (const [i, stair] of this.gameService.stairs.entries()) {
            if (topValues[i] >= ownDeckTop.numericValue) { continue; }
            const stairTop = this.peekLast(stair);
            if (repitedValues.includes(!stairTop ? '0' : stairTop.value)) { continue;}
            repitedValues.push(!stairTop ? '0' : stairTop.value);
            if (await this.tryPlayRecursive(hand, ownDeckTop, stair)){
                await this.play();
                return;
            }
        }*/
        await new Promise(resolve => setTimeout(resolve, 1000));
        // 3. Intentar liberar pilas (usar carta superior de pila)
        repitedValues = [];
        for (const [i, stair] of this.gameService.stairs.entries()) {
            if (topValues[i] >= ownDeckTop.numericValue) { continue; }
            const stairTop = this.peekLast(stair);
            if (repitedValues.includes(!stairTop ? '0' : stairTop.value)) { continue;}
            repitedValues.push(!stairTop ? '0' : stairTop.value);
            if (await this.tryPlayWithPilesRecursive(hand, ownDeckTop, stair, this.gameService.opponentPiles)){
                await this.play();
                return;
            }
        }
        
        // 4. Jugar cartas de la mano o bloquear (si conviene)
        const playerDeckTop = this.peekLast(this.gameService.playerDeck);
        if (!playerDeckTop) return null;
        for (const [i, stair] of this.gameService.stairs.entries()) {
            await this.tryToRetrieveMoreCardsNextTurn(playerDeckTop.numericValue, i);
        }

        //5. intentar bloquear siempre    
        repitedValues = [];
        for (const [i, stair] of this.gameService.stairs.entries()) {
            if (topValues[i] >= playerDeckTop.numericValue) { continue; }
            const stairTop = this.peekLast(stair);
            if (repitedValues.includes(!stairTop ? '0' : stairTop.value)) { continue;}
            repitedValues.push(!stairTop ? '0' : stairTop.value);
            await this.tryBlockRecursive(hand, playerDeckTop, stair);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
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
        for (let i = 0; i < hand.length; i++) {
            const card = hand[i];
            if (await this.rulesService.canPlaceOnStair(stair, card)) {
                // simulo colocar la carta
                hand.splice(i, 1);
                stair.push(card);            
                if (await this.rulesService.canPlaceOnStair(stair, deckTop)) {
                    stair.push(deckTop);
                    this.gameService.opponentDeck.pop();
                    return true; // ya cumplió el objetivo
                }
                // intento con la siguiente carta
                if (!await this.tryPlayRecursive(hand, deckTop, stair)){
                    // rollback si no funcionó más adelante
                    console.log("haciendo rollback de:", card)
                    hand.splice(i, 0, card);
                    stair.pop();
                }else {return true;}    
            }
        }
        return false; // no pudo cumplir el objetivo
    }
    private async tryToRetrieveMoreCardsNextTurn(playerCardValue: number, stair: number){
        for (const [j, card] of this.gameService.opponentHand.entries()) {
            if (await this.rulesService.canPlaceOnStair(this.gameService.stairs[stair], card)) {
                var dangerPoints = playerCardValue - card.numericValue
                if(dangerPoints > 2 || dangerPoints < 1){
                    this.ngZone.run(() => {
                        this.gameService.opponentHand.splice(j, 1);   
                    });
                    await this.delay(200);
                    this.ngZone.run(() => {
                        this.gameService.stairs[stair].push(card);  
                    });                        

                    console.log("no es pelogroso voy a jugar", card);
                    this.tryToRetrieveMoreCardsNextTurn(playerCardValue, stair);
                }else {console.log( "es peligroso jugar" , card, "puntos de peligro", dangerPoints )}
            }
        }
    }
    private async tryBlockRecursive(hand: Card[], deckTop: Card, stair: Card[] ): Promise<boolean> {       
        // Primero intento usar cartas de la mano
        for (let i = 0; i < hand.length; i++) {
            const card = hand[i];
            if (await this.rulesService.canPlaceOnStair(stair, card)) {
                // simulo colocar la carta
                hand.splice(i, 1);
                stair.push(card);        
                if (card.numericValue === deckTop.numericValue ) {
                    console.log("te bloquie el ", deckTop)
                    return true; // ya cumplió el objetivo
                }
                // intento con la siguiente carta
                if (!await this.tryBlockRecursive(hand, deckTop, stair)){
                    // rollback si no funcionó más adelante
                    console.log("haciendo rollback de:", card)
                    hand.splice(i, 0, card);
                    stair.pop();
                } else {return true;}
            }
        }
        return false; // no pudo cumplir el objetivo
    }
    private async tryPlayWithPilesRecursive(hand: Card[], deckTop: Card, stair: Card[], piles: Card[][]): Promise<boolean> {
        // 2. Intento con la carta superior de cada pila
        for (let p = 0; p < piles.length; p++) {
            const pile = piles[p];
            if (pile.length === 0) continue;

            const topPileCard = pile[pile.length - 1];
            if (await this.rulesService.canPlaceOnStair(stair, topPileCard)) {
                // simulo colocar la carta
                pile.pop();
                stair.push(topPileCard);

                if (await this.rulesService.canPlaceOnStair(stair, deckTop)) {
                    stair.push(deckTop);
                    this.gameService.opponentDeck.pop();
                    return true;
                }

                if (!await this.tryPlayWithPilesRecursive(hand, deckTop, stair, piles)) {
                    // rollback
                    stair.pop();
                    pile.push(topPileCard);
                } else {
                    return true;
                }
            }
        }
        for (let i = 0; i < hand.length; i++) {
            const card = hand[i];
            if (await this.rulesService.canPlaceOnStair(stair, card)) {
                // simulo colocar la carta
                hand.splice(i, 1);
                stair.push(card);

                if (await this.rulesService.canPlaceOnStair(stair, deckTop)) {
                    stair.push(deckTop);
                    this.gameService.opponentDeck.pop();
                    return true;
                }

                if (!await this.tryPlayWithPilesRecursive(hand, deckTop, stair, piles)) {
                    // rollback
                    hand.splice(i, 0, card);
                    stair.pop();
                } else {
                    return true;
                }
            }
        }
        return false; // no encontró ninguna ruta válida
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
        else{
            points = points  + (0.01 * cardValue)
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
    delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}