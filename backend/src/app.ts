import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import bodyParser from 'body-parser';
import AIService from './services/aiService';
import ChatController from './controllers/chatController';
import ExportController from './controllers/exportController';
import ChatBot from './bot/index';
import { getDatabaseInfo } from './db/database';
import { appConfig } from './config/config';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { 
        origin: appConfig.security.corsOrigin 
    } 
});

app.use(cors());
app.use(bodyParser.json());

const aiService = AIService;
const chatController = new ChatController();
const exportController = new ExportController();

// REST API endpoint for chat
//app.post('/api/chat', (req, res) => chatController.handleUserQuery(req, res));

// Socket.IO for real-time chat
io.on('connection', (socket) => {
    const bot = new ChatBot(socket, aiService);
    bot.startChat();

    socket.on('userMessage', async (msg: string) => {
        await bot.handleUserMessage(msg);
    });

    // Handle database info request
    socket.on('getDatabaseInfo', async () => {
        try {
            const dbInfo = getDatabaseInfo();
            socket.emit('databaseInfo', dbInfo);
        } catch (error) {
            console.error('Error getting database info:', error);
            socket.emit('databaseInfo', { database: 'unknown', type: 'database' });
        }
    });
});

// Main chat endpoint
app.post('/chat', chatController.handleUserQuery.bind(chatController));

// Export endpoints
app.post('/api/export', exportController.handleExportRequest.bind(exportController));
app.get('/exports/:filename', exportController.handleFileDownload.bind(exportController));
app.get('/api/export/status/:filename', exportController.getExportStatus.bind(exportController));

// Optional additional endpoints
app.get('/health', chatController.healthCheck.bind(chatController));
app.get('/api/export/health', exportController.exportHealthCheck.bind(exportController));
app.post('/init-db', chatController.getDatabaseInfo.bind(chatController));

server.listen(appConfig.server.port, () => {
    console.log(`Server running on ${appConfig.server.baseUrl}`);
});