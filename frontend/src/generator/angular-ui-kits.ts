/**
 * Angular の UIライブラリ(kit)アダプタ(FR-GUI-11)。Angular 生成は中立ツリー(ui-model)経由なので、
 * Svelte と同様「種別 → ラッパーコンポーネント(selector)への写像(tagMap)」+「standalone ラッパー生成」で実現。
 * Angular Material のモジュール import はラッパー内に隠蔽する。
 */
export type AngularKitComponent = Readonly<{
  selector: string;
  className: string;
  /** src/app/ui 配下のファイルパス */
  file: string;
  content: string;
}>;

export type AngularUiKit = Readonly<{
  id: string;
  deps: Readonly<Record<string, string>>;
  /** angular.json の styles に追加(テーマ CSS) */
  styles: ReadonlyArray<string>;
  /** app.config に provideAnimations を入れるか */
  animations: boolean;
  /** 中立ツリーで差し替える種別 → ラッパーの selector */
  tagMap: Readonly<Partial<Record<string, string>>>;
  components: ReadonlyArray<AngularKitComponent>;
}>;

const PLAIN: AngularUiKit = {
  id: 'plain',
  deps: {},
  styles: [],
  animations: false,
  tagMap: {},
  components: [],
};

// ---- Angular Material(standalone ラッパーで mat 部品を隠蔽)----
const matButton = `// 自動生成 — AppForge(Angular Material): ボタン
import { Component, Input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-mat-button',
  standalone: true,
  imports: [MatButtonModule],
  template: \`<button mat-raised-button [color]="variant === 'danger' ? 'warn' : 'primary'">{{ label }}</button>\`,
})
export class AppMatButtonComponent {
  @Input() label = '';
  @Input() variant = 'primary';
}
`;

const matInput = `// 自動生成 — AppForge(Angular Material): 入力
import { Component, Input } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-mat-input',
  standalone: true,
  imports: [MatFormFieldModule, MatInputModule],
  template: \`<mat-form-field appearance="outline"><mat-label>{{ label }}</mat-label><input matInput [type]="inputType" [placeholder]="placeholder" /></mat-form-field>\`,
})
export class AppMatInputComponent {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() inputType = 'text';
}
`;

const MATERIAL: AngularUiKit = {
  id: 'material',
  deps: {
    '@angular/material': '^18.2.0',
    '@angular/cdk': '^18.2.0',
    '@angular/animations': '^18.2.0',
    // Material のピア依存。バージョンを固定しないと npm が v19 を引き ERESOLVE で失敗する
    '@angular/forms': '^18.2.0',
  },
  styles: ['node_modules/@angular/material/prebuilt-themes/azure-blue.css'],
  animations: true,
  tagMap: { button: 'app-mat-button', input: 'app-mat-input' },
  components: [
    { selector: 'app-mat-button', className: 'AppMatButtonComponent', file: 'src/app/ui/app-mat-button.component.ts', content: matButton },
    { selector: 'app-mat-input', className: 'AppMatInputComponent', file: 'src/app/ui/app-mat-input.component.ts', content: matInput },
  ],
};

const ANGULAR_KITS: Readonly<Record<string, AngularUiKit>> = { plain: PLAIN, material: MATERIAL };

export const resolveAngularKit = (id: string | undefined): AngularUiKit =>
  ANGULAR_KITS[id ?? 'plain'] ?? PLAIN;

/** kit の全 selector 集合(emit-angular で「実コンポーネント or プレースホルダ」を判定) */
export const kitSelectorSet = (kit: AngularUiKit): Set<string> =>
  new Set(kit.components.map((c) => c.selector));

/**
 * テンプレート中で使われている selector 集合 → ページ component の import 行 + imports 配列要素。
 * importBase はラッパーへの相対 import 元(例 '../ui')。
 */
export const angularKitImports = (
  kit: AngularUiKit,
  usedSelectors: ReadonlySet<string>,
  importBase: string,
): { importLines: string[]; classNames: string[] } => {
  const comps = kit.components.filter((c) => usedSelectors.has(c.selector));
  return {
    importLines: comps.map(
      (c) => `import { ${c.className} } from '${importBase}/${c.file.replace('src/app/ui/', '').replace('.ts', '')}';`,
    ),
    classNames: comps.map((c) => c.className),
  };
};
