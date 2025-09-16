import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ExportService, ExportRequest, ExportResponse } from '../services/export.service';

export interface ExportDialogData {
  query: string;
  recordCount: number;
}

@Component({
  selector: 'app-export-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatRadioModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatSnackBarModule
  ],
  templateUrl: './export-dialog.component.html',
  styleUrls: ['./export-dialog.component.css']
})
export class ExportDialogComponent implements OnInit {
  selectedFormat: 'excel' | 'csv' = 'excel';
  filename: string = '';
  isExporting: boolean = false;
  exportComplete: boolean = false;
  exportError: string = '';
  exportStatus: string = '';
  exportResult: any = null;

  constructor(
    public dialogRef: MatDialogRef<ExportDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ExportDialogData,
    private exportService: ExportService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    // Generate suggested filename without extension first
    if (!this.filename) {
      const baseFilename = this.exportService.generateFilename(this.data.query, this.selectedFormat);
      // Remove extension from generated filename
      this.filename = baseFilename.replace(/\.(xlsx|csv)$/i, '');
    }
  }

  startExport(): void {
    this.isExporting = true;
    this.exportError = '';
    this.exportStatus = 'Preparing export...';

    // Ensure filename has correct extension (remove existing extension first)
    let finalFilename = this.filename;
    if (finalFilename) {
      // Remove any existing extension
      finalFilename = finalFilename.replace(/\.(xlsx|csv)$/i, '');
      // Add correct extension based on selected format
      const extension = this.selectedFormat === 'excel' ? '.xlsx' : '.csv';
      finalFilename += extension;
    }

    const exportRequest: ExportRequest = {
      query: this.data.query,
      format: this.selectedFormat,
      filename: finalFilename || undefined
    };

    this.exportStatus = 'Exporting data...';

    this.exportService.requestExport(exportRequest).subscribe({
      next: (response: ExportResponse) => {
        this.isExporting = false;
        if (response.success) {
          this.exportComplete = true;
          this.exportResult = response;
          this.exportStatus = '';
          this.snackBar.open(
            `Export completed! ${response.recordCount} records exported.`, 
            'Close', 
            { duration: 5000 }
          );
        } else {
          this.exportError = response.error || 'Export failed';
          this.exportStatus = '';
        }
      },
      error: (error: any) => {
        this.isExporting = false;
        this.exportError = error.message || 'Export failed';
        this.exportStatus = '';
        this.snackBar.open('Export failed: ' + this.exportError, 'Close', { duration: 5000 });
      }
    });
  }

  download(): void {
    if (this.exportResult && this.exportResult.downloadUrl) {
      try {
        this.exportService.downloadFile(this.exportResult.downloadUrl, this.exportResult.filename);
        this.snackBar.open('Download started!', 'Close', { duration: 3000 });
        this.dialogRef.close(true);
      } catch (error) {
        this.snackBar.open('Download failed. Please try again.', 'Close', { duration: 5000 });
      }
    }
  }

  cancel(): void {
    this.dialogRef.close(false);
  }

  onFormatChange(): void {
    // When format changes, we don't need to update the filename
    // The filename should remain without extension
    // The extension will be added dynamically in the UI and when exporting
  }

  getPreviewFilename(): string {
    const baseFilename = this.filename || 'export';
    const extension = this.selectedFormat === 'excel' ? '.xlsx' : '.csv';
    return baseFilename + extension;
  }
}
