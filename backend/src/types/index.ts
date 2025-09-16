export interface UserMessage {
    id: number;
    userId: number;
    message: string;
    timestamp: Date;
}

export interface ChatResponse {
    responseId: number;
    userId: number;
    message: string;
    timestamp: Date;
}

export interface DatabaseQueryData {
    productId: number;
    productName: string;
    category: string;
    price: number;
}

export interface QueryResult {
    success: boolean;
    data: DatabaseQueryData[] | null;
    error?: string;
}