#!/usr/bin/env node
/**
 * CSS-to-Tailwind Migration Script
 * Replaces custom CSS class names with Tailwind utility classes
 * and updates imports to use new reusable components.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC_DIR = join(process.cwd(), 'src');

// Class name to Tailwind utility mapping
const CLASS_MAP = {
  'page-container': 'flex flex-col gap-6',
  'page-header': 'flex items-center justify-between flex-wrap gap-4',
  'page-title': 'text-2xl font-bold text-foreground',
  'page-subtitle': 'text-[0.9375rem] text-muted mt-1',
  'detail-card': 'bg-surface rounded-xl border border-default shadow-sm p-6',
  'detail-grid': 'grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4',
  'detail-item': 'flex flex-col gap-1',
  'detail-label': 'text-xs font-medium text-muted uppercase tracking-wide',
  'detail-value': 'text-[0.9375rem] text-foreground font-medium',
  'form-card': 'bg-surface rounded-xl border border-default shadow-sm p-6',
  'form-grid': 'grid grid-cols-1 sm:grid-cols-2 gap-5',
  'form-group': 'flex flex-col gap-1.5',
  'form-group-full': 'col-span-full',
  'form-actions': 'flex justify-end gap-3 mt-6 pt-5 border-t border-default',
  'form-error': 'text-xs text-danger mt-1',
  'form-label': 'text-sm font-medium text-foreground',
  'dashboard-card': 'bg-surface rounded-xl border border-default shadow-sm overflow-hidden',
  'card-header': 'flex items-center justify-between p-4 px-5 border-b border-default',
  'card-title': 'text-[0.9375rem] font-semibold text-foreground',
  'card-body': 'p-4 px-5',
  'card-link': 'text-[0.8125rem] text-primary font-medium hover:underline',
  'kpi-grid': 'grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4',
  'kpi-card': 'bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md',
  'kpi-icon': 'text-2xl w-12 h-12 flex items-center justify-center rounded-lg bg-surface-secondary',
  'kpi-content': 'flex flex-col',
  'kpi-label': 'text-[0.8125rem] text-muted font-medium',
  'kpi-value': 'text-xl font-bold text-foreground',
  'dashboard-grid': 'grid grid-cols-[repeat(auto-fit,minmax(400px,1fr))] gap-5',
  'table-container': 'bg-surface rounded-xl border border-default shadow-sm overflow-hidden',
  'table-filters': 'p-3 px-4 flex flex-col gap-3',
  'table-search': 'flex gap-2',
  'table-status-filters': 'flex gap-1.5 flex-wrap',
  'filter-chip': 'px-3 py-1 rounded-full text-xs font-medium border border-default bg-background text-muted-foreground cursor-pointer transition-all capitalize hover:border-primary hover:text-primary',
  'filter-chip active': 'px-3 py-1 rounded-full text-xs font-medium border border-primary bg-primary text-white cursor-pointer transition-all capitalize',
  'data-table': 'w-full border-collapse',
  'table-wrapper': 'overflow-x-auto',
  'table-empty': 'text-center py-10 px-4 text-muted',
  'table-actions': 'flex gap-1',
  'table-pagination': 'flex items-center justify-between p-3 px-5 border-t border-default',
  'pagination-info': 'text-[0.8125rem] text-muted',
  'pagination-buttons': 'flex gap-1',
  'mini-table': 'w-full border-collapse',
  'empty-state': 'flex flex-col items-center justify-center py-16 text-center text-muted',
  'dashboard': 'flex flex-col gap-6',
  'not-found': 'flex flex-col items-center justify-center min-h-[50vh] text-center',
  'not-found-code': 'text-[5rem] font-extrabold bg-gradient-to-br from-primary to-secondary bg-clip-text text-transparent',
};

// Button replacements - these need special handling since they combine
const BTN_MAP = {
  'btn btn-primary btn-sm': 'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary-hover transition-all',
  'btn btn-primary': 'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all',
  'btn btn-secondary btn-sm': 'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all',
  'btn btn-secondary': 'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all',
  'btn btn-ghost btn-sm': 'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all',
  'btn btn-ghost': 'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all',
  'btn btn-sm': 'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all',
  'btn': 'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all',
};

function getAllTsxFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
      files.push(...getAllTsxFiles(fullPath));
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function replaceClasses(content) {
  let modified = content;
  let changes = 0;

  // Replace button combinations first (longer matches first)
  const btnKeys = Object.keys(BTN_MAP).sort((a, b) => b.length - a.length);
  for (const btnClass of btnKeys) {
    const escaped = btnClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match exact class string or as part of template literal
    const regex = new RegExp(`(className=["'\`])([^"'\`]*\\b)${escaped}\\b([^"'\`]*)`, 'g');
    const newContent = modified.replace(regex, (match, prefix, before, after) => {
      changes++;
      const replacement = BTN_MAP[btnClass];
      const otherClasses = (before + after).trim();
      return `${prefix}${replacement}${otherClasses ? ' ' + otherClasses : ''}`;
    });
    modified = newContent;
  }

  // Replace single class names
  for (const [className, tailwind] of Object.entries(CLASS_MAP)) {
    const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(className=["'\`][^"'\`]*?)\\b${escaped}\\b([^"'\`]*?["'\`])`, 'g');
    const newContent = modified.replace(regex, (match, prefix, suffix) => {
      changes++;
      return `${prefix}${tailwind}${suffix}`;
    });
    modified = newContent;
  }

  return { content: modified, changes };
}

// Main execution
console.log('🔄 Starting CSS-to-Tailwind migration...\n');

const files = getAllTsxFiles(SRC_DIR);
let totalChanges = 0;
let filesModified = 0;

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const { content: newContent, changes } = replaceClasses(content);
  
  if (changes > 0) {
    writeFileSync(file, newContent, 'utf-8');
    const rel = relative(process.cwd(), file);
    console.log(`  ✅ ${rel} (${changes} replacements)`);
    totalChanges += changes;
    filesModified++;
  }
}

console.log(`\n✨ Migration complete!`);
console.log(`   Files modified: ${filesModified}`);
console.log(`   Total replacements: ${totalChanges}`);
