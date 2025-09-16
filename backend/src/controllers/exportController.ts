import { Request, Response } from 'express';
import ExportService, { ExportRequest } from '../services/exportService';
import * as path from 'path';

class ExportController {
  private exportService: ExportService;

  constructor() {
    this.exportService = new ExportService();
    
    // Clean up old exports on startup and every hour
    this.exportService.cleanupOldExports();
    setInterval(() => {
      this.exportService.cleanupOldExports();
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Handle export request
   */
  async handleExportRequest(req: Request, res: Response) {
    try {
      const { query, format, filename } = req.body;

      // Validate input
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'SQL query is required and cannot be empty'
        });
      }

      if (!format || !['excel', 'csv'].includes(format)) {
        return res.status(400).json({
          success: false,
          error: 'Format must be either "excel" or "csv"'
        });
      }

      console.log(`Export request received: format=${format}, query=${query.substring(0, 100)}...`);

      const exportRequest: ExportRequest = {
        query: query.trim(),
        format: format as 'excel' | 'csv',
        filename: filename || undefined
      };

      // Process the export
      const result = await this.exportService.exportQueryResults(exportRequest);

      if (result.success) {
        res.json({
          success: true,
          message: `Export completed successfully. ${result.recordCount} records exported.`,
          downloadUrl: result.downloadUrl,
          filename: result.filename,
          recordCount: result.recordCount
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error || 'Export failed'
        });
      }

    } catch (error: any) {
      console.error('Export Controller Error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Internal server error during export',
        message: error.message || 'An unexpected error occurred during export.'
      });
    }
  }

  /**
   * Handle file download
   */
  async handleFileDownload(req: Request, res: Response) {
    try {
      const filename = req.params.filename;

      if (!filename) {
        return res.status(400).json({
          success: false,
          error: 'Filename is required'
        });
      }

      // Validate filename (security check)
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid filename'
        });
      }

      const fileInfo = this.exportService.getExportInfo(filename);

      if (!fileInfo.exists) {
        return res.status(404).json({
          success: false,
          error: 'File not found or has expired'
        });
      }

      console.log(`Serving download: ${filename} (${fileInfo.size} bytes)`);

      // Set appropriate headers for download
      const extension = path.extname(filename).toLowerCase();
      let contentType = 'application/octet-stream';
      let disposition = 'attachment';

      if (extension === '.xlsx') {
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else if (extension === '.csv') {
        contentType = 'text/csv';
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
      res.setHeader('Content-Length', fileInfo.size || 0);
      res.setHeader('Cache-Control', 'no-cache');

      // Stream the file
      res.sendFile(fileInfo.path!, (err) => {
        if (err) {
          console.error('Error sending file:', err);
          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              error: 'Error downloading file'
            });
          }
        }
      });

    } catch (error: any) {
      console.error('Download Controller Error:', error);
      
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Internal server error during download',
          message: error.message || 'An unexpected error occurred during download.'
        });
      }
    }
  }

  /**
   * Get export status/info
   */
  async getExportStatus(req: Request, res: Response) {
    try {
      const filename = req.params.filename;

      if (!filename) {
        return res.status(400).json({
          success: false,
          error: 'Filename is required'
        });
      }

      const fileInfo = this.exportService.getExportInfo(filename);

      res.json({
        success: true,
        exists: fileInfo.exists,
        size: fileInfo.size,
        filename: filename
      });

    } catch (error: any) {
      console.error('Export Status Error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message || 'An unexpected error occurred.'
      });
    }
  }

  /**
   * Health check for export service
   */
  async exportHealthCheck(req: Request, res: Response) {
    try {
      res.json({
        success: true,
        message: 'Export service is healthy',
        timestamp: new Date().toISOString(),
        service: 'ExportController'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Export service health check failed',
        message: error.message
      });
    }
  }
}

export default ExportController;
