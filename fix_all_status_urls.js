const fs = require('fs');
const path = require('path');

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const stat = fs.statSync(path.join(dir, file));
    if (stat.isDirectory()) {
      walk(path.join(dir, file), fileList);
    } else {
      if (file === 'page.tsx') fileList.push(path.join(dir, file));
    }
  }
  return fileList;
}

const pages = walk('src/app/(dashboard)');

let updatedCount = 0;

for (const p of pages) {
  let content = fs.readFileSync(p, 'utf8');

  // Skip if it doesn't even have searchParams or status
  if (!content.includes('status?: string') && !content.includes('status=')) continue;
  
  // Skip if it was already migrated (e.g. penggajian)
  if (content.includes('const urlStatus = dbStatus ? statusToIndo[dbStatus] : ""')) continue;

  let changed = false;

  // Ensure import of statusToIndo and indoToStatus
  if (content.includes('statusLabel') && !content.includes('statusToIndo')) {
    content = content.replace(
      /import { statusLabel } from "@\/lib\/utils\/status-labels"/,
      'import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"'
    );
  } else if (!content.includes('statusToIndo')) {
    // If it doesn't import statusLabel at all but needs it
    content = content.replace(
      'import { AppSearchField }',
      'import { statusToIndo, indoToStatus } from "@/lib/utils/status-labels"\nimport { AppSearchField }'
    );
  }

  // Rewrite parameter parsing
  if (content.includes('const params = await searchParams')) {
    if (!content.includes('dbStatusParam')) {
      content = content.replace(
        'const params = await searchParams',
        'const params = await searchParams\n  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined'
      );
      changed = true;
    }
  }

  // Rewrite where clause
  if (content.includes('status: params.status')) {
    content = content.replace(
      /\.\.\.\(params\.status && \{ status: params\.status \} \)/g,
      '...((dbStatusParam || params.status) && { status: dbStatusParam || params.status })'
    );
    // Specifically handle the exact standard format
    content = content.replace(
      /\.\.\.\(params\.status && \{ status: params\.status \}\)/g,
      '...((dbStatusParam || params.status) && { status: dbStatusParam || params.status })'
    );
    changed = true;
  }

  // Rewrite map rendering logic
  const mapRegex = /\{\[\s*([^\]]+?)\s*\].map\(\(([a-zA-Z]+)\) => \(\s*<Link key=\{[a-zA-Z]+\} href=\{`[^`]+\?status=\$\{([a-zA-Z]+)\}`\} className=\{`filter-chip \$\{params\.status === ([a-zA-Z]+) \|\| \(\!params\.status && \!([a-zA-Z]+)\) \? "active" : ""\}`\}>\s*\{[a-zA-Z]+ \? statusLabel\([a-zA-Z]+\) : "Semua"\}\s*<\/Link>\s*\)\)\}/gs;
  
  // It's tricky to replace perfectly. Let's do a more robust string replacement approach.
  // We look for: {["", "draft", ...].map((s) => ( ... ))}
  const lines = content.split('\n');
  let newLines = [];
  let inMap = false;
  let arrayContent = "";
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/\{\[\s*".*?"\s*\].map\(\([a-zA-Z]+\) => \(/)) {
      // Extract array part
      const arrMatch = line.match(/\{\s*(\[.*?\])\.map/);
      if (arrMatch) {
        arrayContent = arrMatch[1];
        
        // Find base URL from the next few lines
        let baseUrl = "";
        for (let j = i; j < i + 5; j++) {
          if (lines[j] && lines[j].includes('href={`/')) {
            const urlMatch = lines[j].match(/href=\{`(\/[^?]+)\?status=\$/);
            if (urlMatch) baseUrl = urlMatch[1];
          }
        }
        
        if (baseUrl) {
          // Replace this block
          newLines.push(`            {${arrayContent}.map((dbStatus) => {`);
          newLines.push(`              const urlStatus = dbStatus ? statusToIndo[dbStatus] || dbStatus : ""`);
          newLines.push(`              return (`);
          newLines.push(`                <Link `);
          newLines.push(`                  key={dbStatus} `);
          newLines.push(`                  href={\`${baseUrl}\${urlStatus ? \`?status=\${urlStatus}\` : ""}\`} `);
          newLines.push(`                  className={\`filter-chip \${params.status === urlStatus || (!params.status && !urlStatus) ? "active" : ""}\`}`);
          newLines.push(`                >`);
          newLines.push(`                  {dbStatus ? statusLabel(dbStatus) : "Semua"}`);
          newLines.push(`                </Link>`);
          newLines.push(`              )`);
          newLines.push(`            })}`);
          
          // Skip the original map block lines
          let skipLevel = 1;
          for (let k = i + 1; k < lines.length; k++) {
            i = k;
            if (lines[k].includes('</Link>')) {
              if (lines[k+1].includes('))}')) {
                i = k + 1;
              }
              break;
            }
          }
          changed = true;
          continue;
        }
      }
    }
    newLines.push(line);
  }
  
  content = newLines.join('\n');

  if (changed) {
    fs.writeFileSync(p, content, 'utf8');
    updatedCount++;
    console.log("Updated: " + p);
  }
}

console.log("Total files localized: " + updatedCount);
