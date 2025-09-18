/*
-Define los pasos de un turno: robar carta, jugar carta, validar jugada, pasar turno, etc.
-Orquesta llamadas entre GameService (estado) y GameRulesService (validaciones).
-Sería algo así como el motor del juego.
*/
import { Injectable } from "@angular/core";
import { GameService } from "./game.service";
import { GameZone } from "../enum/game-zone.enum";
import { CurrentPlayerType } from "../enum/player.enum";
import { BehaviorSubject, Subject } from "rxjs";
import { GameStep } from "../enum/game-step.enum";
import { CpuAiService } from "./gameCpu.service";
import { SocketService } from "./socket.service";
import { NotificationService } from "./notification.service";

@Injectable({providedIn: 'root'})
export class GameStepService { 
    tie$ = new Subject<void>();
    currentPlayerId$: typeof this.socketService.currentPlayerId$;
    constructor(private gameService: GameService, private gameCpu: CpuAiService, private socketService: SocketService, private notificationService: NotificationService) {
        this.currentPlayerId$ = this.socketService.currentPlayerId$;
    }

    //OBSERVABLE PARA EL TURNO ACTUAL
    private currentPlayerType = new BehaviorSubject<CurrentPlayerType>(CurrentPlayerType.Player);
    currentPlayerType$ = this.currentPlayerType.asObservable();
    //OBSERVABLE PARA EL PASO DEL TURNO
    private currentStep = new BehaviorSubject<GameStep>(GameStep.Initializing);
    currentStep$ = this.currentStep.asObservable();

    async setStep(step: GameStep) {
        this.currentStep.next(step);
    }
    async resetGame() {
        this.currentPlayerType.next(CurrentPlayerType.Player);
        this.currentStep.next(GameStep.Playing);
    }
    async resetValues() {
        this.currentPlayerType.next(CurrentPlayerType.Player);
        this.currentStep.next(GameStep.Initializing);
    }
    async draw(playerType: CurrentPlayerType, player: string = "non-multiplayer") {
        await new Promise(resolve => setTimeout(resolve, 650));
        if (this.currentPlayerType.getValue() !== playerType) { this.notificationService.show("⚠ No es tu Turno"); return; }
        if (this.currentStep.getValue() !== GameStep.Drawing) { this.notificationService.show(`⚠ Paso incorrecto.`); return;}
        if (player !== "non-multiplayer" && this.currentPlayerId$.getValue() !== player) { this.notificationService.show("⚠ No es tu Turno"); return; }
        var hand = this.currentPlayerType.getValue() === CurrentPlayerType.Player ? this.gameService.getHandPlCount() : this.gameService.getHandOpCount();
        for (const [i, stair] of this.gameService.getStairs.entries()) {
            if (stair.length === 13 && (stair[stair.length - 1].value === 'K' || stair[stair.length - 1].value === 'C')) {
                await this.gameService.removeStairAndReShufle(i);
                await this.socketService.updateReShufle();
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        // Roba hasta tener 5 cartas en mano
        while (hand < 5 ) {
            const card = this.gameService.drawCard();
            if (card) {
                await this.gameService.pushCard( this.currentPlayerType.getValue() === CurrentPlayerType.Player ? GameZone.PlayerHand : GameZone.OpponentHand, card);
            }
            else {
                this.tie$.next();
                return;
            }
            if (player !== "non-multiplayer"){
                await new Promise(resolve => setTimeout(resolve, 150))
                await this.socketService.playCard();
            }
            hand++;
        }
        this.currentStep.next(GameStep.Playing);
    }
    async play(playerType: CurrentPlayerType, player: string = "non-multiplayer"): Promise<boolean> {
        if (this.currentPlayerType.getValue() !== playerType) { this.notificationService.show("⚠ No es tu Turno"); return false; }
        if (player !== "non-multiplayer" && this.currentPlayerId$.getValue() !== player) { this.notificationService.show("⚠ No es tu Turno"); return false; }
        if (this.currentStep.getValue() !== GameStep.Playing) {this.notificationService.show(`⚠ Paso incorrecto.`); return false;}
        if (playerType === CurrentPlayerType.Cpu) {
            await this.gameCpu.play();
            this.currentStep.next(GameStep.Discarding);
        }
        return true;
    }
    async discard(playerType: CurrentPlayerType, player: string = "non-multiplayer"): Promise<boolean> {
        if (this.currentPlayerType.getValue() !== playerType) { this.notificationService.show("⚠ No es tu Turno"); return false; }
        if (!(this.currentStep.getValue() === GameStep.Discarding || (this.currentStep.getValue() === GameStep.Playing && playerType === CurrentPlayerType.Player))) {
            this.notificationService.show(`⚠ Paso incorrecto.`);
            return false;
        }
        if (player !== "non-multiplayer" && this.currentPlayerId$.getValue() !== player) { this.notificationService.show("⚠ No es tu Turno"); return false; }
        if (playerType === CurrentPlayerType.Cpu) {
            await this.gameCpu.discard();
        }
        this.currentStep.next(GameStep.Ending);
        return true;
    }
    async endTurn(player: string) {
        if (this.currentStep.getValue() !== GameStep.Ending) { this.notificationService.show(`⚠ Paso incorrecto.`); return;}
        if (player !== "non-multiplayer" && this.currentPlayerId$.getValue() !== player) { this.notificationService.show("⚠ No es tu Turno"); return;}
        this.currentStep.next(GameStep.Finished);
        if (player === "non-multiplayer") {
            const nextPlayer = this.currentPlayerType.getValue() === CurrentPlayerType.Player ? CurrentPlayerType.Cpu : CurrentPlayerType.Player;
            this.currentPlayerType.next(nextPlayer);
            this.currentStep.next(GameStep.Drawing);
        }
    }
}