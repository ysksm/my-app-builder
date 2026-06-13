import { ComponentNode } from './component-node';
import { PageId } from './ids';

export type Page = Readonly<{
  id: PageId;
  name: string;
  path: string;
  root: ComponentNode;
  useHeader: boolean;
  useFooter: boolean;
}>;

export const Page = {
  create(name: string, path: string): Page {
    return {
      id: PageId.create(),
      name,
      path: Page.normalizePath(path),
      root: ComponentNode.create('container'),
      useHeader: true,
      useFooter: true,
    };
  },

  normalizePath(path: string): string {
    const trimmed = path.trim().replace(/\s+/g, '-');
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  },
} as const;
