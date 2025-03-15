import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, HostListener } from '@angular/core';
import { NgxChartsModule } from '@swimlane/ngx-charts';
import * as shape from 'd3-shape';

@Component({
  selector: 'app-test-chart',
  standalone: true,
  imports: [CommonModule, NgxChartsModule],
  template: `
    <div class="card">
      <div class="card-body">
        <h5 class="card-title mb-3">Sample Data Chart</h5>
        <div id="test-chart-container" style="height: 350px;">
          <ngx-charts-line-chart
            [view]="view"
            [scheme]="colorScheme"
            [results]="chartData"
            [gradient]="false"
            [xAxis]="true"
            [yAxis]="true"
            [legend]="true"
            [showXAxisLabel]="true"
            [showYAxisLabel]="true"
            [curve]="curve"
            xAxisLabel="Date"
            yAxisLabel="Value"
            [autoScale]="true"
          >
          </ngx-charts-line-chart>
        </div>
      </div>
    </div>
  `,
})
export class TestChartComponent implements AfterViewInit {
  // Use a predefined color scheme name
  colorScheme = 'vivid';
  view: [number, number] = [700, 350]; // Default dimensions
  curve = shape.curveMonotoneX; // Use d3 curve function

  chartData = [
    {
      name: 'Sample',
      series: [
        { name: new Date('2023-01-01'), value: 100 },
        { name: new Date('2023-01-02'), value: 150 },
        { name: new Date('2023-01-03'), value: 120 },
        { name: new Date('2023-01-04'), value: 180 },
        { name: new Date('2023-01-05'), value: 140 },
      ],
    },
  ];

  ngAfterViewInit(): void {
    // Check if we're in a browser environment before setting the timeout
    if (typeof window !== 'undefined') {
      // Calculate dimensions after view is initialized
      setTimeout(() => this.onResize(), 100);
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    // Check if we're in a browser environment
    if (typeof document === 'undefined') {
      return; // Exit early if not in a browser
    }

    const containerElement = document.getElementById('test-chart-container');
    if (containerElement) {
      // Get the width of the container
      const width = containerElement.clientWidth || 700;
      // Set the height proportionally
      const height = Math.min(350, width * 0.5);

      // Update the view dimensions for the chart
      this.view = [width, height];
    }
  }
}
