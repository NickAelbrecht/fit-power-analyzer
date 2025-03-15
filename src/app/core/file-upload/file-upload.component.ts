import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Store } from '@ngrx/store';
import { FitParserService } from '../../services/fit-parser.service';
import * as ActivityActions from '../../store/activity/activity.actions';

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './file-upload.component.html',
  styleUrls: ['./file-upload.component.scss'],
})
export class FileUploadComponent {
  isDragging = false;
  isProcessing = false;
  errorMessage: string | null = null;

  // Add progress tracking properties
  completedFiles = 0;
  totalFiles = 0;
  uploadProgress = 0;

  constructor(
    private fitParserService: FitParserService,
    private store: Store
  ) {}

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;

    const files = event.dataTransfer?.files;
    if (files) {
      this.handleFiles(files);
    }
  }

  onFileSelected(event: Event): void {
    const element = event.target as HTMLInputElement;
    const files = element.files;
    if (files) {
      this.handleFiles(files);
    }
  }

  private handleFiles(files: FileList): void {
    if (files.length === 0) return;

    this.isProcessing = true;
    this.errorMessage = null;

    // Reset progress tracking
    this.completedFiles = 0;
    this.uploadProgress = 0;

    const validFiles = Array.from(files).filter((file) => file.name.endsWith('.fit'));
    this.totalFiles = validFiles.length;

    if (this.totalFiles === 0) {
      this.errorMessage = 'No valid .FIT files were selected';
      this.isProcessing = false;
      return;
    }

    validFiles.forEach((file) => {
      this.fitParserService.parseFitFile(file).subscribe({
        next: (activity) => {
          this.store.dispatch(ActivityActions.addActivity({ activity }));
          this.completedFiles++;
          this.uploadProgress = Math.round((this.completedFiles / this.totalFiles) * 100);

          if (this.completedFiles === this.totalFiles) {
            this.isProcessing = false;
          }
        },
        error: (error) => {
          this.errorMessage = `Error processing file ${file.name}: ${error.message}`;
          this.completedFiles++;
          this.uploadProgress = Math.round((this.completedFiles / this.totalFiles) * 100);

          if (this.completedFiles === this.totalFiles) {
            this.isProcessing = false;
          }
        },
      });
    });
  }

  openFileSelector(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    document.getElementById('fileInput')?.click();
  }
}
