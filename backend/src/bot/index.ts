import AIService from '../services/aiService';

class ChatBot {
    socket: any;
    aiService: typeof AIService;

    constructor(socket: any, aiService: typeof AIService) {
        this.socket = socket;
        this.aiService = aiService;
    }

    startChat() {
        // Notify user that chat session has started
        this.socket.emit('botMessage', 'Hello! I am your database AI assistant. Ask me anything about your data.');
    }

    async handleUserMessage(message: string) {
        // Analyze the user's message using AI/NLP
        const response = await this.aiService.handleUserQuery(message);
        this.respondToUser(response);
    }

    respondToUser(response: { type: string; content: string; }) {
        // Send response back to the user via socket
        // Frontend expects a string, so send the content
        this.socket.emit('botMessage', response.content);
    }
}

export default ChatBot;