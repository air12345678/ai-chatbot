import { Request, Response } from 'express';
import AIService from '../services/aiService';

class ChatController {
    private aiService: AIService;

    constructor() {
        this.aiService = new AIService();
    }

    async handleUserQuery(req: Request, res: Response) {
        try {
            const { message } = req.body;

            // Validate input
            if (!message || typeof message !== 'string' || message.trim().length === 0) {
                return res.status(400).json({ 
                    error: 'Message is required and cannot be empty' 
                });
            }

            console.log(`Received user message: "${message}"`);

            // Process the message using the AI service
            const response = await this.aiService.handleUserQuery(message.trim());

            // Return the response
            res.json({ 
                response: response,
                timestamp: new Date().toISOString()
            });

        } catch (error: any) {
            console.error('Chat Controller Error:', error);
            
            // Return more specific error messages
            const errorMessage = error.message || 'An unexpected error occurred while processing your request.';
            
            res.status(500).json({ 
                error: 'Internal server error',
                message: errorMessage,
                response: '❌ Sorry, I encountered an error while processing your request. Please try again.'
            });
        }
    }

    // Optional: Add a health check method
    async healthCheck(req: Request, res: Response) {
        try {
            // You could test database connectivity here
            res.json({ 
                status: 'healthy',
                service: 'AI Chatbot',
                timestamp: new Date().toISOString()
            });
        } catch (error: any) {
            res.status(500).json({ 
                status: 'unhealthy',
                error: error.message 
            });
        }
    }

    // Optional: Get database info endpoint
    async getDatabaseInfo(req: Request, res: Response) {
        try {
            await this.aiService.initializeDatabaseContext();
            
            res.json({
                message: 'Database context initialized successfully',
                availableTables: 'Ask me about AdventureWorks database tables, products, employees, sales, etc.'
            });
        } catch (error: any) {
            res.status(500).json({
                error: 'Failed to initialize database context',
                message: error.message
            });
        }
    }
}

export default ChatController;