import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule, DatePipe } from '@angular/common';
import { io, Socket } from 'socket.io-client';

interface ChatMessage {
  sender: string;
  text: string;
  timestamp: Date;
}

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css',
  standalone: true,
  imports: [FormsModule, CommonModule],
  providers: [DatePipe]
})
export class ChatComponent implements OnInit, OnDestroy {
  messages: ChatMessage[] = [];
  userMessage: string = '';
  socket!: Socket;
  isBotTyping: boolean = false;
  isUserTyping: boolean = false;

  ngOnInit() {
    this.socket = io('http://localhost:3000');
    
    // Listen for bot messages
    this.socket.on('botMessage', (msg: string) => {
      this.isBotTyping = false; // Stop typing indicator
      this.messages.push({ 
        sender: 'Bot', 
        text: msg,
        timestamp: new Date()
      });
      this.scrollToBottom();
    });

    // Listen for bot typing indicator
    this.socket.on('botTyping', (isTyping: boolean) => {
      this.isBotTyping = isTyping;
      if (isTyping) {
        this.scrollToBottom();
      }
    });
    
    this.socket.emit('startChat');
    
    // Add welcome message with typing simulation
    setTimeout(() => {
      this.isBotTyping = true;
      setTimeout(() => {
        this.isBotTyping = false;
        this.messages.push({
          sender: 'Bot',
          text: '👋 **Welcome to AdventureWorks AI Assistant!**\n\nI can help you query the AdventureWorks database. Try asking about:\n- Employees and departments\n- Products and sales\n- Customers and orders\n- Reports and statistics\n\nWhat would you like to know?',
          timestamp: new Date()
        });
        this.scrollToBottom();
      }, 1500);
    }, 500);
  }

  ngOnDestroy() {
    this.socket.disconnect();
  }

  sendMessage() {
    if (!this.userMessage.trim()) return;
    
    const message = this.userMessage.trim();
    
    // Add user message
    this.messages.push({ 
      sender: 'User', 
      text: message,
      timestamp: new Date()
    });
    
    // Clear input and show bot typing
    this.userMessage = '';
    this.isBotTyping = true;
    
    // Send message to server
    this.socket.emit('userMessage', message);
    
    this.scrollToBottom();
  }

  // Handle user typing indicator
  onUserTyping() {
    if (!this.isUserTyping) {
      this.isUserTyping = true;
      this.socket.emit('userTyping', true);
      
      // Stop typing indicator after 3 seconds of inactivity
      setTimeout(() => {
        this.isUserTyping = false;
        this.socket.emit('userTyping', false);
      }, 3000);
    }
  }

  // Format bot messages to handle markdown-like formatting
  formatBotMessage(message: string): string {
    return message
      // Convert **bold** to <strong>
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Convert *italic* to <em>
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Convert code blocks ``` to proper HTML
      .replace(/```([\s\S]*?)```/g, '<pre class="code-block"><code>$1</code></pre>')
      // Convert inline code
      .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
      // Convert line breaks
      .replace(/\n/g, '<br>')
      // Handle special characters
      .replace(/❌/g, '<span class="error-icon">❌</span>')
      // Handle checkmarks
      .replace(/✅/g, '<span class="success-icon">✅</span>');
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
