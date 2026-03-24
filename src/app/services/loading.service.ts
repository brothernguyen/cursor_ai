import { Injectable, computed, signal } from '@angular/core';

/**
 * Global loading counter for full-app overlays (e.g. PrimeNG ProgressSpinner).
 * Use begin()/end() in pairs; supports nested concurrent requests.
 */
@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly count = signal(0);

  readonly isLoading = computed(() => this.count() > 0);

  begin(): void {
    this.count.update((c) => c + 1);
  }

  end(): void {
    this.count.update((c) => Math.max(0, c - 1));
  }
}
