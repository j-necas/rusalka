// shared test setup: DOMParser from @xmldom/xmldom (built into the browser)
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
globalThis.DOMParser ??= DOMParser;
globalThis.XMLSerializer ??= XMLSerializer;
