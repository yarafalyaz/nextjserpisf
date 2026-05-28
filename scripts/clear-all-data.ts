import { prisma } from "../src/lib/db/prisma";

async function main() {
  console.log("=== CLEAR ALL TRANSACTION DATA ===");

  try {
    // Disable foreign key checks
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0;');

    // CRM
    if (prisma.crmTicketComment) await prisma.crmTicketComment.deleteMany({});
    if (prisma.crmTicket) await prisma.crmTicket.deleteMany({});
    if (prisma.leadActivity) await prisma.leadActivity.deleteMany({});
    if (prisma.lead) await prisma.lead.deleteMany({});
    
    // HRM
    if (prisma.payroll) await prisma.payroll.deleteMany({});
    if (prisma.timesheet) await prisma.timesheet.deleteMany({});
    if (prisma.attendance) await prisma.attendance.deleteMany({});
    if (prisma.leaveRequest) await prisma.leaveRequest.deleteMany({});
    if (prisma.overtimeRequest) await prisma.overtimeRequest.deleteMany({});
    if (prisma.employeeLoan) await prisma.employeeLoan.deleteMany({});
    
    // Projects
    if (prisma.projectLog) await prisma.projectLog.deleteMany({});
    if (prisma.projectStageProgress) await prisma.projectStageProgress.deleteMany({});
    if (prisma.projectStage) await prisma.projectStage.deleteMany({});
    if (prisma.task) await prisma.task.deleteMany({});
    if (prisma.projectItem) await prisma.projectItem.deleteMany({});
    if (prisma.project) await prisma.project.deleteMany({});
    
    // Manufacturing
    if (prisma.productionOrderMaterial) await prisma.productionOrderMaterial.deleteMany({});
    if (prisma.productionOrder) await prisma.productionOrder.deleteMany({});
    
    // Assets
    if (prisma.assetTransfer) await prisma.assetTransfer.deleteMany({});
    if (prisma.assetHistory) await prisma.assetHistory.deleteMany({});
    if (prisma.asset) await prisma.asset.deleteMany({});
    
    // Finance
    if (prisma.bankReconciliationItem) await prisma.bankReconciliationItem.deleteMany({});
    if (prisma.bankReconciliation) await prisma.bankReconciliation.deleteMany({});
    if (prisma.bankStatementLine) await prisma.bankStatementLine.deleteMany({});
    if (prisma.bankStatement) await prisma.bankStatement.deleteMany({});
    if (prisma.pettyCash) await prisma.pettyCash.deleteMany({});
    if (prisma.expense) await prisma.expense.deleteMany({});
    if (prisma.journalEntry) await prisma.journalEntry.deleteMany({});
    if (prisma.journal) await prisma.journal.deleteMany({});
    if (prisma.budget) await prisma.budget.deleteMany({});
    
    // Approval
    if (prisma.approvalHistory) await prisma.approvalHistory.deleteMany({});
    if (prisma.approval) await prisma.approval.deleteMany({});
    
    // Inventory
    if (prisma.itemSerial) await prisma.itemSerial.deleteMany({});
    if (prisma.itemBatch) await prisma.itemBatch.deleteMany({});
    if (prisma.deliveryOrderItem) await prisma.deliveryOrderItem.deleteMany({});
    if (prisma.deliveryOrder) await prisma.deliveryOrder.deleteMany({});
    if (prisma.materialIssueItem) await prisma.materialIssueItem.deleteMany({});
    if (prisma.materialIssue) await prisma.materialIssue.deleteMany({});
    if (prisma.stockAdjustmentItem) await prisma.stockAdjustmentItem.deleteMany({});
    if (prisma.stockAdjustment) await prisma.stockAdjustment.deleteMany({});
    if (prisma.inventoryTransferItem) await prisma.inventoryTransferItem.deleteMany({});
    if (prisma.inventoryTransfer) await prisma.inventoryTransfer.deleteMany({});
    if (prisma.inventoryLayer) await prisma.inventoryLayer.deleteMany({});
    if (prisma.stockMove) await prisma.stockMove.deleteMany({});
    
    // Purchase
    if (prisma.vendorPaymentAllocation) await prisma.vendorPaymentAllocation.deleteMany({});
    if (prisma.vendorPayment) await prisma.vendorPayment.deleteMany({});
    if (prisma.vendorBillItem) await prisma.vendorBillItem.deleteMany({});
    if (prisma.vendorBill) await prisma.vendorBill.deleteMany({});
    if (prisma.purchaseReturnItem) await prisma.purchaseReturnItem.deleteMany({});
    if (prisma.purchaseReturn) await prisma.purchaseReturn.deleteMany({});
    if (prisma.goodsReceiptItem) await prisma.goodsReceiptItem.deleteMany({});
    if (prisma.goodsReceipt) await prisma.goodsReceipt.deleteMany({});
    if (prisma.purchaseOrderItem) await prisma.purchaseOrderItem.deleteMany({});
    if (prisma.purchaseOrder) await prisma.purchaseOrder.deleteMany({});
    if (prisma.purchaseRequestItem) await prisma.purchaseRequestItem.deleteMany({});
    if (prisma.purchaseRequest) await prisma.purchaseRequest.deleteMany({});
    
    // Sales
    if (prisma.salesPayment) await prisma.salesPayment.deleteMany({});
    if (prisma.salesInvoiceItem) await prisma.salesInvoiceItem.deleteMany({});
    if (prisma.salesInvoice) await prisma.salesInvoice.deleteMany({});
    if (prisma.salesReturnItem) await prisma.salesReturnItem.deleteMany({});
    if (prisma.salesReturn) await prisma.salesReturn.deleteMany({});
    if (prisma.salesOrderItem) await prisma.salesOrderItem.deleteMany({});
    if (prisma.salesOrder) await prisma.salesOrder.deleteMany({});
    if (prisma.quotationItem) await prisma.quotationItem.deleteMany({});
    if (prisma.quotationHistory) await prisma.quotationHistory.deleteMany({});
    if (prisma.quotationSection) await prisma.quotationSection.deleteMany({});
    if (prisma.quotation) await prisma.quotation.deleteMany({});
    if (prisma.downPayment) await prisma.downPayment.deleteMany({});
    if (prisma.workOrderItem) await prisma.workOrderItem.deleteMany({});
    if (prisma.workOrder) await prisma.workOrder.deleteMany({});

    // Reset sequence counter
    if (prisma.documentSequence) await prisma.documentSequence.deleteMany({});

    // Delete mock accounts
    await prisma.$executeRawUnsafe("DELETE FROM accounts WHERE code LIKE 'E2E-%' OR code LIKE 'GAP-%';");
    console.log("Deleted E2E and GAP accounts.");

    console.log("\n✅ Done! All mock transaction data cleared.");
  } catch (e) {
    console.error("Error clearing data:", e);
  } finally {
    // Re-enable foreign key checks
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1;');
    await prisma.$disconnect();
  }
}

main();
