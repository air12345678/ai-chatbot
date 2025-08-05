export const logMessage = (message: string): void => {
    console.log(`[LOG] ${new Date().toISOString()}: ${message}`);
};

export const formatResponse = (data: any): object => {
    return {
        status: 'success',
        data: data,
        timestamp: new Date().toISOString()
    };
};

export const handleError = (error: any): object => {
    return {
        status: 'error',
        message: error.message || 'An unexpected error occurred',
        timestamp: new Date().toISOString()
    };
};