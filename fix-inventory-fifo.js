const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/lib/services/inventory-fifo.ts');
let code = fs.readFileSync(file, 'utf8');

const regex = /if\s*\(batchConsumption\.size\s*>\s*0\)\s*\{[\s\S]*?(?=\/\/ Mark serials as used)/;
const replacement = `if (batchConsumption.size > 0) {
      // Hoist the batch lookup to O(1) before the loop
      const uniqueBatchNumbers = Array.from(batchConsumption.keys()).map(k => k.split("|")[0])
      const batchesData = await tx.itemBatch.findMany({
        where: {
          itemId,
          batchNumber: { in: uniqueBatchNumbers },
          // Filter by warehouse in memory since the IN clause covers all batches
        }
      })
      
      const batchUpdates: Promise<any>[] = []
      
      for (const [key, qtyOut] of batchConsumption.entries()) {
        const [batchNumber, whId] = key.split("|")
        const batchWarehouseId = whId ? parseInt(whId, 10) : null
        
        const batches = batchesData.filter(b => 
          b.batchNumber === batchNumber && 
          (batchWarehouseId != null ? b.warehouseId === batchWarehouseId : true)
        )
        
        let remainingToDecrement = qtyOut
        for (const batch of batches) {
          if (remainingToDecrement <= 0) break
          const deduct = Math.min(remainingToDecrement, Number(batch.qty))
          if (deduct > 0) {
            batchUpdates.push(
              tx.itemBatch.update({
                where: { id: batch.id },
                data: { qty: { decrement: deduct } },
              })
            )
            remainingToDecrement -= deduct
          }
        }
      }
      if (batchUpdates.length > 0) {
        await Promise.all(batchUpdates)
      }
    }
    `;

code = code.replace(regex, replacement);
fs.writeFileSync(file, code);

console.log("Done");
