import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private messageSubject = new BehaviorSubject<string | null>(null);
  message$ = this.messageSubject.asObservable();

  show(message: string) {
    this.messageSubject.next(message);
    // Ocultar después de 3 segundos
    setTimeout(() => this.clear(), 3000);
  }

  clear() {
    this.messageSubject.next(null);
  }
}