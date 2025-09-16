import ExcelJS from 'exceljs';
import { createObjectCsvWriter } from 'csv-writer';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { executeQuery } from '../db/database';
import { appConfig } from '../config/config';

export interface ExportRequest {
  query: string;
  format: 'excel' | 'csv';
  filename?: string;
}

export interface ExportResult {
  success: boolean;
  downloadUrl?: string;
  filename?: string;
  error?: string;
  recordCount?: number;
}

class ExportService {
  private readonly exportDir = appConfig.export.directory;
  private readonly baseUrl = appConfig.export.baseUrl;

  constructor() {
    // Ensure export directory exists
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }
  }

  /**
   * Export query results to Excel or CSV format
   */
  async exportQueryResults(exportRequest: ExportRequest): Promise<ExportResult> {
    try {
      console.log('Starting export process:', exportRequest);

      // Execute the SQL query to get full dataset
      const data = await executeQuery(exportRequest.query);
      
      if (!data || !Array.isArray(data) || data.length === 0) {
        return {
          success: false,
          error: 'No data found for the given query'
        };
      }

      const recordCount = data.length;
      
      // Generate unique filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const uniqueId = uuidv4().substring(0, 8);
      const baseFilename = exportRequest.filename || `export_${timestamp}_${uniqueId}`;
      
      let filename: string;
      let filePath: string;

      if (exportRequest.format === 'excel') {
        filename = `${baseFilename}.xlsx`;
        filePath = path.join(this.exportDir, filename);
        await this.generateExcelFile(data, filePath);
      } else {
        filename = `${baseFilename}.csv`;
        filePath = path.join(this.exportDir, filename);
        await this.generateCsvFile(data, filePath);
      }

      const downloadUrl = `${this.baseUrl}/${filename}`;

      console.log(`Export completed: ${filename} (${recordCount} records)`);

      return {
        success: true,
        downloadUrl,
        filename,
        recordCount
      };

    } catch (error: any) {
      console.error('Export error:', error);
      return {
        success: false,
        error: error.message || 'Failed to export data'
      };
    }
  }

  /**
   * Generate Excel file from data
   */
  private async generateExcelFile(data: any[], filePath: string): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Data Export');

    if (data.length === 0) {
      throw new Error('No data to export');
    }

    // Get column names from first record
    const columns = Object.keys(data[0]);

    // Set up columns with headers
    worksheet.columns = columns.map(col => ({
      header: col,
      key: col,
      width: Math.max(col.length + 5, 15) // Dynamic width based on column name
    }));

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6E6FA' }
    };

    // Add data rows
    data.forEach(record => {
      const row = worksheet.addRow(record);
      
      // Format cells based on data type
      row.eachCell((cell, colNumber) => {
        const value = cell.value;
        
        if (value instanceof Date) {
          cell.numFmt = 'mm/dd/yyyy';
        } else if (typeof value === 'number') {
          cell.numFmt = '#,##0.00';
        }
      });
    });

    // Auto-fit columns
    worksheet.columns.forEach(column => {
      if (column && typeof column.eachCell === 'function') {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell) => {
          const columnLength = cell.value ? cell.value.toString().length : 10;
          if (columnLength > maxLength) {
            maxLength = columnLength;
          }
        });
        column.width = Math.min(maxLength + 2, 50); // Max width of 50
      }
    });

    // Add borders to all cells
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });

    await workbook.xlsx.writeFile(filePath);
  }

  /**
   * Generate CSV file from data
   */
  private async generateCsvFile(data: any[], filePath: string): Promise<void> {
    if (data.length === 0) {
      throw new Error('No data to export');
    }

    // Get column names from first record
    const columns = Object.keys(data[0]);

    // Create CSV writer
    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: columns.map(col => ({ id: col, title: col }))
    });

    // Write data to CSV
    await csvWriter.writeRecords(data);
  }

  /**
   * Clean up old export files (older than 1 hour)
   */
  async cleanupOldExports(): Promise<void> {
    try {
      const files = fs.readdirSync(this.exportDir);
      const oneHourAgo = Date.now() - (60 * 60 * 1000); // 1 hour in milliseconds

      for (const file of files) {
        const filePath = path.join(this.exportDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime.getTime() < oneHourAgo) {
          fs.unlinkSync(filePath);
          console.log(`Cleaned up old export file: ${file}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up old exports:', error);
    }
  }

  /**
   * Get file info for a specific export
   */
  getExportInfo(filename: string): { exists: boolean; path?: string; size?: number } {
    const filePath = path.join(this.exportDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return { exists: false };
    }

    const stats = fs.statSync(filePath);
    return {
      exists: true,
      path: filePath,
      size: stats.size
    };
  }
}

export default ExportService;
