import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import bodyParser from 'body-parser';
import AIService from './services/aiService';
import ChatController from './controllers/chatController';
import ChatBot from './bot/index';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(bodyParser.json());

const aiService = new AIService();
const chatController = new ChatController();

// REST API endpoint for chat
//app.post('/api/chat', (req, res) => chatController.handleUserQuery(req, res));

// Socket.IO for real-time chat
io.on('connection', (socket) => {
    const bot = new ChatBot(socket, aiService);
    bot.startChat();

    socket.on('userMessage', async (msg: string) => {
        await bot.handleUserMessage(msg);
    });
});

// Main chat endpoint
app.post('/chat', chatController.handleUserQuery.bind(chatController));

// Optional additional endpoints
app.get('/health', chatController.healthCheck.bind(chatController));
app.post('/init-db', chatController.getDatabaseInfo.bind(chatController));

server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});