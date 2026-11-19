// العربية: قاموس يجمع نصوص التطبيق والإضافات والتدريب والمحرر.
import app from './ar/app.js';
import extras from './ar/extras.js';
import practice from './ar/practice.js';
import editor from './ar/editor.js';

export default { ...app, ...extras, ...practice, ...editor };
