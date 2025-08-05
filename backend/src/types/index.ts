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

export interface AdventureWorksData {
    productId: number;
    productName: string;
    category: string;
    price: number;
}

export interface QueryResult {
    success: boolean;
    data: AdventureWorksData[] | null;
    error?: string;
}