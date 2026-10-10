// Type surface for the vendored react-remove-scroll sources (bundled from git checkout via esbuild alias).
declare module 'react-remove-scroll' {
  import type * as React from 'react';
  export interface RemoveScrollProps { enabled?: boolean; allowPinchZoom?: boolean; removeScrollBar?: boolean; shards?: Array<React.RefObject<unknown> | HTMLElement>; as?: string | React.ElementType; children?: React.ReactNode; className?: string; style?: React.CSSProperties; noIsolation?: boolean; inert?: boolean; forwardProps?: boolean; gapMode?: 'padding' | 'margin'; sideCar?: unknown; ref?: React.Ref<unknown> }
  export const RemoveScroll: React.ComponentType<RemoveScrollProps> & { classNames: { fullWidth: string; zeroRight: string } };
}
