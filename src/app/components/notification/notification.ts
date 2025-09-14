import { Component, inject } from '@angular/core';
import { NotificationService } from '../../services/notification.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-notification',
  imports: [CommonModule],
  templateUrl: './notification.html',
  styleUrls: ['./notification.scss']
})
export class NotificationComponent {
  private notificationService = inject(NotificationService);
  message$ = this.notificationService.message$;
}