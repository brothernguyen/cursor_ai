import {
  Component,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

/** Loaded via angular.json scripts (swagger-ui-bundle.js). */
declare global {
  interface Window {
    SwaggerUIBundle?: (options: Record<string, unknown>) => unknown;
  }
}

@Component({
  selector: 'app-api-docs',
  imports: [CommonModule, RouterLink],
  templateUrl: './api-docs.component.html',
  styleUrl: './api-docs.component.scss',
})
export class ApiDocsComponent implements AfterViewInit, OnDestroy {
  protected readonly swaggerHost = viewChild.required<ElementRef<HTMLElement>>(
    'swaggerHost',
  );

  private uiInstance: unknown;

  ngAfterViewInit(): void {
    const SwaggerUIBundle = window.SwaggerUIBundle;
    if (!SwaggerUIBundle) {
      console.error('SwaggerUIBundle not found. Check angular.json scripts.');
      return;
    }

    const id = this.swaggerHost().nativeElement.id;
    this.uiInstance = SwaggerUIBundle({
      dom_id: `#${id}`,
      url: '/openapi.yaml',
      deepLinking: true,
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      tryItOutEnabled: true,
    });
  }

  ngOnDestroy(): void {
    const root = this.swaggerHost()?.nativeElement;
    if (root) {
      root.replaceChildren();
    }
    this.uiInstance = undefined;
  }
}
