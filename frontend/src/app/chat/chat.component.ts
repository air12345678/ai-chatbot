import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule, DatePipe } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { io, Socket } from 'socket.io-client';
import { ExportService } from '../services/export.service';
import { ExportDialogComponent } from '../export-dialog/export-dialog.component';

interface ChatMessage {
  sender: string;
  text: string;
  timestamp: Date;
  isExportable: boolean;
  exportQuery: string;
  recordCount: number;
  isCopied: boolean;
}

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css',
  standalone: true,
  imports: [FormsModule, CommonModule, MatButtonModule, MatIconModule, MatTooltipModule],
  providers: [DatePipe]
})
export class ChatComponent implements OnInit, OnDestroy {
  messages: ChatMessage[] = [];
  userMessage: string = '';
  socket!: Socket;
  isBotTyping: boolean = false;
  isUserTyping: boolean = false;
  hasMatIcon: boolean = true; // Detect if Material Icons are loaded

  constructor(
    private dialog: MatDialog,
    private exportService: ExportService
  ) {}

  ngOnInit() {
    this.socket = io('http://localhost:3000');
    
    // Listen for bot messages
    this.socket.on('botMessage', (msg: string) => {
      this.isBotTyping = false; // Stop typing indicator
      
      // Check if message is exportable
      const isExportable = this.exportService.isExportable(msg);
      let recordCount = 0;
      let exportQuery = '';
      
      if (isExportable) {
        recordCount = this.exportService.getRecordCount(msg) || 0;
        exportQuery = this.exportService.extractSqlQuery(msg) || '';
        console.log('Message is exportable:', { recordCount, exportQuery }); // Debug log
      }

      this.messages.push({
        sender: 'Bot',
        text: msg,
        timestamp: new Date(),
        isExportable,
        exportQuery,
        recordCount,
        isCopied: false
      });
      
      // Debug log
      if (recordCount > 0) {
        console.log('Added message with records:', { recordCount, messageId: this.messages.length - 1 });
      }
      
      this.scrollToBottom();
    });

    // Get database info for dynamic welcome message
    this.socket.emit('getDatabaseInfo');
    
    // Listen for database info response
    this.socket.on('databaseInfo', (dbInfo: any) => {
      const dbName = dbInfo.database || 'your database';
      const dbType = dbInfo.type || 'database';
      
      setTimeout(() => {
        this.messages.push({
          sender: 'Bot',
          text: `👋 **Welcome to Database AI Assistant!**\n\nI'm connected to your **${dbType.toUpperCase()}** database: **${dbName}**\n\nI can help you:\n- Analyze data and generate insights\n- Create business reports\n- Solve data problems\n- Identify trends and patterns\n- Generate SQL queries with explanations\n\nWhat would you like to explore?`,
          timestamp: new Date(),
          isCopied: false,
          isExportable: false,
          exportQuery: '',
          recordCount: 0
        });
      }, 500);
    });

    // Fallback welcome message if database info fails
    setTimeout(() => {
      if (this.messages.length === 0) {
        this.messages.push({
          sender: 'Bot',
          text: '👋 **Welcome to Database AI Assistant!**\n\nI can help you analyze your database and solve business problems. Try asking about:\n- Data analysis and insights\n- Business reports and metrics\n- Trends and patterns\n- Problem-solving recommendations\n\nWhat would you like to explore?',
          timestamp: new Date(),
          isCopied: false,
          isExportable: false,
          exportQuery: '',
          recordCount: 0
        });
      }
    }, 1500);
  }

  ngOnDestroy() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  sendMessage() {
    if (!this.userMessage.trim()) return;

    // Add user message to chat
    this.messages.push({
      sender: 'User',
      text: this.userMessage,
      timestamp: new Date(),
      isCopied: false,
      isExportable: false,
      exportQuery: '',
      recordCount: 0
    });

    // Show typing indicator
    this.isBotTyping = true;

    // Send message to server
    this.socket.emit('userMessage', this.userMessage);

    // Clear input
    this.userMessage = '';

    this.scrollToBottom();
  }

  onUserTyping() {
    // Optional: Add typing indicator logic for user
  }

  formatBotMessage(text: string): string {
    // First, handle encoding issues by properly decoding HTML entities
    text = text.replace(/&quot;/g, '"')
               .replace(/&amp;/g, '&')
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&#39;/g, "'")
               .replace(/&nbsp;/g, ' ');

    // Convert markdown tables to enhanced HTML tables
    if (text.includes('|')) {
      let lines = text.split('\n');
      let tableStarted = false;
      let tableHtml = '';
      let inTable = false;

      lines = lines.map(line => {
        if (line.includes('|')) {
          if (!inTable) {
            inTable = true;
            tableHtml = '<div class="message-table-container"><div class="table-wrapper"><table class="data-table">';
          }

          const cells = line.split('|')
            .filter(cell => cell.length)
            .map(cell => cell.trim());

          if (cells.length === 0) return line;

          // Check if it's a separator row
          if (cells.every(cell => /^[-:]+$/.test(cell))) {
            return ''; // Skip separator rows
          }

          // Determine if this is a header row
          const isHeader = !tableStarted;
          tableStarted = true;

          const cellTag = isHeader ? 'th' : 'td';
          const rowHtml = cells
            .map(cell => {
              const content = cell.replace(/`/g, '').trim();
              return `<${cellTag}>${content}</${cellTag}>`;
            })
            .join('');

          if (isHeader) {
            tableHtml += `<thead><tr>${rowHtml}</tr></thead><tbody>`;
          } else {
            tableHtml += `<tr>${rowHtml}</tr>`;
          }

          return '';
        } else if (inTable) {
          inTable = false;
          tableStarted = false;
          tableHtml += '</tbody></table></div></div>';
          return tableHtml;
        }
        return line;
      });

      if (inTable) {
        lines.push('</tbody></table></div></div>');
      }

      text = lines.join('\n');
    }

    // Convert markdown to HTML for other elements
    text = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');

    return text;
  }

  // Export functionality
  openExportDialog(message: ChatMessage) {
    if (!message.isExportable || !message.exportQuery) {
      console.error('Message is not exportable or missing query');
      return;
    }

    const dialogRef = this.dialog.open(ExportDialogComponent, {
      width: '500px',
      data: {
        query: message.exportQuery,
        recordCount: message.recordCount
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        console.log('Export initiated:', result);
      }
    });
  }

  // Copy message functionality
  copyMessage(message: ChatMessage, index: number) {
    // Get the text content without HTML formatting
    let textToCopy = message.text;
    
    // If it's a bot message, try to extract clean text
    if (message.sender === 'Bot') {
      // Remove markdown formatting
      textToCopy = textToCopy
        .replace(/\*\*(.*?)\*\*/g, '$1')  // Remove bold
        .replace(/__(.*?)__/g, '$1')      // Remove italic
        .replace(/`([^`]+)`/g, '$1')      // Remove code formatting
        .replace(/<br>/g, '\n')           // Convert <br> to newlines
        .replace(/<[^>]*>/g, '');         // Remove any HTML tags
      
      // Handle tables - convert to readable text format
      if (textToCopy.includes('```')) {
        textToCopy = textToCopy.replace(/```([\s\S]*?)```/g, (match, content) => {
          // Keep the table content as is for copying
          return content.trim();
        });
      }
    }
    
    // Try modern clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        this.showCopySuccess(index);
      }).catch(err => {
        console.error('Failed to copy: ', err);
        this.fallbackCopy(textToCopy, index);
      });
    } else {
      // Fallback for older browsers or non-secure contexts
      this.fallbackCopy(textToCopy, index);
    }
  }

  private showCopySuccess(index: number) {
    // Set the copied state
    this.messages[index].isCopied = true;
    
    // Reset after 2 seconds
    setTimeout(() => {
      if (this.messages[index]) {
        this.messages[index].isCopied = false;
      }
    }, 2000);
  }

  private fallbackCopy(text: string, index: number) {
    // Create a temporary textarea element
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    
    textArea.focus();
    textArea.select();
    
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        this.showCopySuccess(index);
      } else {
        console.error('Fallback: Oops, unable to copy');
      }
    } catch (err) {
      console.error('Fallback: Oops, unable to copy', err);
    }
    
    document.body.removeChild(textArea);
  }

  // Get copy button text based on state
  getCopyButtonText(index: number): string {
    return this.messages[index]?.isCopied ? '✓ Copied' : '📄 Copy';
  }

  // Get copy icon based on state
  getCopyIcon(index: number): string {
    return this.messages[index]?.isCopied ? 'done' : 'copy';
  }

  // Get fallback copy icon (text-based) based on state
  getCopyFallbackIcon(index: number): string {
    return this.messages[index]?.isCopied ? '✓' : '📄';
  }

  // Get copy tooltip based on state
  getCopyTooltip(index: number): string {
    return this.messages[index]?.isCopied ? 'Copied!' : 'Copy message';
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      const chatMessages = document.getElementById('chatMessages');
      if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    }, 100);
  }
}
