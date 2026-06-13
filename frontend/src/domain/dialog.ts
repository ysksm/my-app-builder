import { ComponentNode } from './component-node';
import { DialogId } from './ids';

export type DialogDef = Readonly<{
  id: DialogId;
  title: string;
  root: ComponentNode;
}>;

export const DialogDef = {
  create(title: string): DialogDef {
    return { id: DialogId.create(), title, root: ComponentNode.create('container') };
  },
} as const;
