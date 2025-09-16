import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { saveAs } from 'file-saver';

export interface ExportRequest {
  query: string;
  format: 'excel' | 'csv';
  filename?: string;
}

export interface ExportResponse {
  success: boolean;
  message?: string;
  downloadUrl?: string;
  filename?: string;
  recordCount?: number;
  error?: string;
}

export interface ExportStatus {
  success: boolean;
  exists: boolean;
  size?: number;
  filename: string;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ExportService {
  private readonly apiUrl = 'http://localhost:3000/api';
  private readonly baseUrl = 'http://localhost:3000';

  constructor(private http: HttpClient) {}

  /**
   * Request export of query results
   */
  requestExport(exportRequest: ExportRequest): Observable<ExportResponse> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    return this.http.post<ExportResponse>(`${this.apiUrl}/export`, exportRequest, { headers })
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Download the exported file
   */
  downloadFile(downloadUrl: string, filename: string): void {
    try {
      // Extract filename from URL
      const actualFilename = filename || downloadUrl.split('/').pop() || 'export';
      
      // Fetch the file and trigger download
      fetch(downloadUrl)
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.blob();
        })
        .then(blob => {
          saveAs(blob, actualFilename);
        })
        .catch(error => {
          console.error('Download failed:', error);
          throw error;
        });
    } catch (error) {
      console.error('Download error:', error);
      throw error;
    }
  }

  /**
   * Check export status
   */
  getExportStatus(filename: string): Observable<ExportStatus> {
    return this.http.get<ExportStatus>(`${this.apiUrl}/export/status/${filename}`)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Get export health status
   */
  getExportHealth(): Observable<any> {
    return this.http.get(`${this.apiUrl}/export/health`)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Check if a message contains exportable data
   */
  isExportable(message: string): boolean {
    // Check for table markers and SQL query
    const hasTable = message.includes('<table') || 
                    (message.includes('```') && message.includes('|') && message.includes('-'));
    const hasSqlQuery = message.toLowerCase().includes('select') && 
                       message.toLowerCase().includes('from');
    
    return hasTable && hasSqlQuery;
  }

  // Extract record count from message
  getRecordCount(message: string): number {
    try {
      // Look for record count in the message
      const countMatch = message.match(/(\d+)\s*(?:rows?|records?|results?)/i);
      if (countMatch) {
        return parseInt(countMatch[1], 10);
      }
      
      // Count table rows if no explicit count found
      if (message.includes('<table')) {
        const rowMatches = message.match(/<tr/g);
        return rowMatches ? rowMatches.length - 1 : 0; // Subtract 1 for header row
      }
      
      // Count markdown table rows
      if (message.includes('```') && message.includes('|')) {
        const tableContent = message.match(/```([\s\S]*?)```/)?.[1] || '';
        const rows = tableContent.split('\n').filter(line => line.includes('|'));
        return rows.length > 2 ? rows.length - 2 : 0; // Subtract header and separator rows
      }
      
      return 0;
    } catch (error) {
      console.error('Error getting record count:', error);
      return 0;
    }
  }

  // Extract SQL query from message
  extractSqlQuery(message: string): string {
    try {
      // Look for SQL query between backticks or code blocks
      const sqlMatch = message.match(/```sql\s*([\s\S]*?)```/) || 
                      message.match(/`(SELECT[\s\S]*?)`/i);
      
      if (sqlMatch && sqlMatch[1]) {
        return sqlMatch[1].trim();
      }
      
      // Look for SELECT statement
      const selectMatch = message.match(/SELECT[\s\S]*?FROM[\sS]*?(?:WHERE|GROUP BY|ORDER BY|LIMIT|;|$)/i);
      return selectMatch ? selectMatch[0].trim() : '';
    } catch (error) {
      console.error('Error extracting SQL query:', error);
      return '';
    }
  }

  /**
   * Generate suggested filename based on query
   */
  generateFilename(query: string, format: 'excel' | 'csv'): string {
    try {
      // Extract table names from query
      const tableMatches = query.match(/(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)/gi);
      
      let baseName = 'export';
      if (tableMatches && tableMatches.length > 0) {
        const tableName = tableMatches[0].replace(/^(FROM|JOIN)\s+/i, '').trim();
        baseName = tableName.split('.').pop() || 'export';
      }

      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      const extension = format === 'excel' ? 'xlsx' : 'csv';
      
      return `${baseName}_${timestamp}.${extension}`;
    } catch (error) {
      console.error('Error generating filename:', error);
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      const extension = format === 'excel' ? 'xlsx' : 'csv';
      return `export_${timestamp}.${extension}`;
    }
  }

  /**
   * Check if content looks like SQL
   */
  private looksLikeSQL(content: string): boolean {
    const sqlKeywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'GROUP BY', 'ORDER BY'];
    const upperContent = content.toUpperCase();
    return sqlKeywords.some(keyword => upperContent.includes(keyword));
  }

  /**
   * Handle HTTP errors
   */
  private handleError(error: any): Observable<never> {
    let errorMessage = 'An unknown error occurred';
    
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Client Error: ${error.error.message}`;
    } else {
      // Server-side error
      errorMessage = `Server Error: ${error.status} - ${error.error?.message || error.message}`;
    }
    
    console.error('Export Service Error:', errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}
