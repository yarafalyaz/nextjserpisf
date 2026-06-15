const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/actions/manufacturing.actions.ts');
let code = fs.readFileSync(file, 'utf8');

// Replace:
//   materials: {
//     create: product.materials.map((m) => ({
//       itemId: m.itemId,
//       qty: safeMultiply(Number(m.qty), v.qty, 4),
//     })),
//   },
code = code.replace(
  /materials:\s*\{\s*create:\s*product\.materials\.map\(\(m\)\s*=>\s*\{\s*return\s*\{\s*itemId:\s*m\.itemId,\s*qty:\s*safeMultiply\(Number\(m\.qty\),\s*v\.qty,\s*4\),\s*\}\s*\}\)\s*\},/g,
  `materials: { create: product.materials.map((m) => ({ itemId: m.itemId, qty: safeMultiply(Number(m.qty), v.qty, 4) })) },`
);

// Actually, let's fix it more cleanly with a targeted find-replace or AST tool if needed,
// but the original code is fine, no N+1 there (it's a nested create).
