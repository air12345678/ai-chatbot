import AIService from '../services/aiService';

class ChatBot {
    socket: any;
    aiService: AIService;

    constructor(socket: any, aiService: AIService) {
        this.socket = socket;
        this.aiService = aiService;
    }

    startChat() {
        // Notify user that chat session has started
        this.socket.emit('botMessage', 'Hello! I am your Adventure Works assistant. Ask me anything about the database.');
    }

    async handleUserMessage(message: string) {
        // Analyze the user's message using AI/NLP
        const response = await this.aiService.handleUserQuery(message);
        this.respondToUser(response);
    }

    respondToUser(response: string) {
        // Send response back to the user via socket
        this.socket.emit('botMessage', response);
    }
}

export default ChatBot;