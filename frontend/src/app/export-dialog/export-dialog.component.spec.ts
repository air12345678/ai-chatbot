import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { ExportDialogComponent } from './export-dialog.component';
import { ExportService } from '../services/export.service';

describe('ExportDialogComponent', () => {
  let component: ExportDialogComponent;
  let fixture: ComponentFixture<ExportDialogComponent>;
  let mockDialogRef: jasmine.SpyObj<MatDialogRef<ExportDialogComponent>>;
  let mockExportService: jasmine.SpyObj<ExportService>;
  let mockSnackBar: jasmine.SpyObj<MatSnackBar>;

  const mockDialogData = {
    query: 'SELECT * FROM Users',
    recordCount: 100
  };

  beforeEach(async () => {
    mockDialogRef = jasmine.createSpyObj('MatDialogRef', ['close']);
    mockExportService = jasmine.createSpyObj('ExportService', ['requestExport', 'downloadFile', 'generateFilename']);
    mockSnackBar = jasmine.createSpyObj('MatSnackBar', ['open']);

    await TestBed.configureTestingModule({
      imports: [
        ExportDialogComponent,
        NoopAnimationsModule
      ],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
        { provide: ExportService, useValue: mockExportService },
        { provide: MatSnackBar, useValue: mockSnackBar }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ExportDialogComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with default values', () => {
    mockExportService.generateFilename.and.returnValue('test_export.xlsx');
    
    component.ngOnInit();
    
    expect(component.selectedFormat).toBe('excel');
    expect(component.isExporting).toBe(false);
    expect(component.exportComplete).toBe(false);
    expect(mockExportService.generateFilename).toHaveBeenCalled();
  });

  it('should start export process', () => {
    const mockResponse = {
      success: true,
      recordCount: 100,
      downloadUrl: 'http://test.com/file.xlsx',
      filename: 'test.xlsx'
    };
    
    mockExportService.requestExport.and.returnValue(of(mockResponse));
    
    component.startExport();
    
    expect(component.isExporting).toBe(false);
    expect(component.exportComplete).toBe(true);
    expect(component.exportResult).toEqual(mockResponse);
  });

  it('should close dialog on cancel', () => {
    component.cancel();
    
    expect(mockDialogRef.close).toHaveBeenCalledWith(false);
  });
});
