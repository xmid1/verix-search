declare module "jsdom" {
  export interface DOMWindow extends Window {
    document: Document;
  }
  export interface JSDOMOptions {
    url?: string;
    referrer?: string;
    contentType?: string;
    includeNodeLocations?: boolean;
    storageQuota?: number;
    runScripts?: "dangerously" | "outside-only";
    resources?: "usable" | object;
    pretendToBeVisual?: boolean;
  }
  export class JSDOM {
    constructor(html: string, options?: JSDOMOptions);
    readonly window: DOMWindow;
    readonly virtualConsole: object;
    serialize(): string;
    static fromURL(url: string, options?: JSDOMOptions): Promise<JSDOM>;
    static fromFile(filename: string, options?: JSDOMOptions): Promise<JSDOM>;
  }
}

declare module "turndown" {
  export interface Options {
    headingStyle?: "setext" | "atx";
    hr?: string;
    bulletListMarker?: "-" | "+" | "*";
    codeBlockStyle?: "indented" | "fenced";
    fence?: "```" | "~~~";
    emDelimiter?: "_" | "*";
    strongDelimiter?: "__" | "**";
    linkStyle?: "inlined" | "referenced";
    linkReferenceStyle?: "full" | "collapsed" | "shortcut";
    preformattedCode?: boolean;
    blankReplacement?: (content: string, node: HTMLNode) => string;
    keepReplacement?: (content: string, node: HTMLNode) => string;
    defaultReplacement?: (content: string, node: HTMLNode) => string;
  }

  export interface HTMLNode {
    nodeName: string;
    nodeType: number;
    firstChild: HTMLNode | null;
    parentNode: HTMLNode | null;
    getAttribute(name: string): string | null;
    querySelector(selector: string): HTMLNode | null;
    textContent: string | null;
  }

  export interface Rule {
    filter: string | string[] | ((node: HTMLNode, options: Options) => boolean);
    replacement: (content: string, node: HTMLNode, options: Options) => string;
  }

  export default class TurndownService {
    constructor(options?: Options);
    turndown(input: string | HTMLElement | Document): string;
    use(plugin: Plugin | Plugin[]): this;
    addRule(key: string, rule: Rule): this;
    keep(filter: Rule["filter"]): this;
    remove(filter: Rule["filter"]): this;
    escape(str: string): string;
    options: Required<Options>;
    rules: {
      array: Rule[];
      blankRule: Rule;
      defaultRule: Rule;
      keepReplacement: Rule;
    };
  }

  export type Plugin = (service: TurndownService) => void;
}
