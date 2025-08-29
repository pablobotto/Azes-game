/*
-Define los pasos de un turno: robar carta, jugar carta, validar jugada, pasar turno, etc.
-Orquesta llamadas entre GameService (estado) y GameRulesService (validaciones).
-Sería algo así como el motor del juego.
*/
import { Injectable } from "@angular/core";
import { GameService } from "./game.service";
import { GameZone } from "../enum/game-zone.enum";
import { Player } from "../enum/player.enum";
import { BehaviorSubject } from "rxjs";
import { GameStep } from "../enum/game-step.enum";
import { CpuAiService } from "./gameCpu.service";

@Injectable({providedIn: 'root'})
export class GameStepService { 
    constructor(private gameService: GameService, private gameCpu: CpuAiService) {}

    //OBSERVABLE PARA EL TURNO ACTUAL
    private currentPlayer = new BehaviorSubject<Player>(Player.Player);
    currentPlayer$ = this.currentPlayer.asObservable();

    //OBSERVABLE PARA EL PASO DEL TURNO
    private currentStep = new BehaviorSubject<GameStep>(GameStep.Initializing);
    currentStep$ = this.currentStep.asObservable();

    async resetGame() {
        this.currentPlayer.next(Player.Player);
        this.currentStep.next(GameStep.Playing);
    }
    async draw(player: Player) {
        if (this.currentPlayer.getValue() !== player) { console.warn("No es tu turno;"); return; }
        if (this.currentStep.getValue() !== GameStep.Drawing) { console.warn(`No es el paso de robar cartas. Paso actual: ${this.currentStep}`);
            return;
        }
        var hand = this.currentPlayer.getValue() === Player.Player ? this.gameService.getHandPlCount() : this.gameService.getHandOpCount();
        // Roba hasta tener 5 cartas en mano
        while (hand < 5 ) {
            const card = this.gameService.drawCard();
            if (card) {
                console.log('neuva carta');
                console.log(card);
                await this.gameService.pushCard( this.currentPlayer.getValue() === Player.Player ? GameZone.PlayerHand : GameZone.OpponentHand, card);
            }
            hand++;
        }
        this.currentStep.next(GameStep.Playing);
    }
    async play(player: Player) {
        if (this.currentPlayer.getValue() !== player) { console.warn("No es tu turno;"); return false; }
        if (this.currentStep.getValue() !== GameStep.Playing) {console.warn(`No es el paso de jugar cartas. Paso actual: ${this.currentStep.getValue()}`); return;}
        if (player === Player.Opponent) {
            await this.gameCpu.play();
        }
        this.currentStep.next(GameStep.Discarding);
        return;
    }
    async discard(player: Player): Promise<boolean> {
        if (this.currentPlayer.getValue() !== player) { console.warn("No es tu turno;"); return false; }
        if (!(this.currentStep.getValue() === GameStep.Discarding || (this.currentStep.getValue() === GameStep.Playing && player === Player.Player))) {
            console.warn(`No es el paso de descartar cartas. Paso actual: ${this.currentStep.getValue()}`);
            return false;
        }
        if (player === Player.Opponent) {
            await this.gameCpu.discard();
        }
        this.currentStep.next(GameStep.Ending);
        return true;
    }
    async endTurn() {
        if (this.currentStep.getValue() !== GameStep.Ending) {
            console.warn(`No es el paso de finalizar turno. Paso actual: ${this.currentStep.getValue()}`);
            return;
        }
        this.currentStep.next(GameStep.Finished);
        const nextPlayer = this.currentPlayer.getValue() === Player.Player ? Player.Opponent : Player.Player;
        this.currentPlayer.next(nextPlayer);
        this.currentStep.next(GameStep.Drawing);
    }
}