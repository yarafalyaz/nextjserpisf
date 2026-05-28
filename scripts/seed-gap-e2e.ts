import { AccountType } from "@prisma/client";
import { prisma } from "../src/lib/db/prisma";
import { generateDocumentNumber } from "../src/lib/utils/document-number";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function ensureAccount(code: string, name: string, type: AccountType) {
  return prisma.account.upsert({
    where: { code },
    update: { name, type, isActive: true },
    create: {
      code,
      name,
      type,
      normalBalance:
        type === AccountType.LIABILITY || type === AccountType.REVENUE
          ? "credit"
          : "debit",
    },
  });
}

async function main() {
  console.log("=== E2E: SEED GAP MODULES ===\n");

  // ─── Base Data ─────────────────────────────────────────────────────────
  const assetAccount = await ensureAccount("GAP-1200", "GAP Fixed Assets", AccountType.ASSET);
  const accumDepAccount = await ensureAccount("GAP-1201", "GAP Accum Depreciation", AccountType.ASSET);
  const depExpAccount = await ensureAccount("GAP-5200", "GAP Depreciation Expense", AccountType.EXPENSE);
  const gainLossAccount = await ensureAccount("GAP-4900", "GAP Gain/Loss on Disposal", AccountType.REVENUE);
  const cashAccount = await ensureAccount("GAP-1000", "GAP Cash/Bank", AccountType.ASSET);
  const expenseAccount = await ensureAccount("GAP-5100", "GAP General Expense", AccountType.EXPENSE);

  let user = await prisma.user.findFirst({ select: { id: true } });
  if (!user) {
    user = await prisma.user.create({
      data: { name: "GAP Seed User", email: "gap-seed@test.local", password: "hashed" },
      select: { id: true },
    });
  }

  let item = await prisma.item.findFirst({ where: { sku: "GAP-ITEM-001" } });
  if (!item) {
    item = await prisma.item.create({
      data: { sku: "GAP-ITEM-001", name: "GAP Raw Material", price: 50000, cost: 30000, qtyOnHand: 100 },
    });
  }

  let item2 = await prisma.item.findFirst({ where: { sku: "GAP-ITEM-002" } });
  if (!item2) {
    item2 = await prisma.item.create({
      data: { sku: "GAP-ITEM-002", name: "GAP Component B", price: 25000, cost: 15000, qtyOnHand: 200 },
    });
  }

  let vendor = await prisma.vendor.findFirst({ where: { code: "GAP-VEND" } });
  if (!vendor) {
    vendor = await prisma.vendor.create({
      data: { code: "GAP-VEND", name: "GAP Vendor", phone: "081300000001" },
    });
  }

  let employee = await prisma.employee.findFirst();
  if (!employee) {
    employee = await prisma.employee.create({
      data: { name: "GAP Employee", code: "EMP-GAP-001" } as any,
    });
  }

  let employee2 = await prisma.employee.findFirst({ where: { NOT: { id: employee.id } } });
  if (!employee2) {
    employee2 = await prisma.employee.create({
      data: { name: "GAP Employee 2", code: "EMP-GAP-002" } as any,
    });
  }

  console.log("Base data ready ✓\n");

  // ═══════════════════════════════════════════════════════════════════════
  // 1. ASSET MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════
  console.log("── 1. Asset Management ──");

  // AssetCategory
  const assetCategory = await prisma.assetCategory.create({
    data: {
      name: "GAP Office Equipment",
      code: "GAP-OFC",
      depreciationRate: 20.0,
      usefulLife: 5,
      assetAccountId: assetAccount.id,
      accumulatedDepreciationAccountId: accumDepAccount.id,
      depreciationExpenseAccountId: depExpAccount.id,
      gainLossAccountId: gainLossAccount.id,
    },
  });
  console.log(`  AssetCategory created: ${assetCategory.name} (id=${assetCategory.id})`);
  assert(assetCategory.depreciationRate?.toString() === "20", "depreciationRate should be 20");
  assert(assetCategory.usefulLife === 5, "usefulLife should be 5");

  // AssetGroup
  const assetGroup = await prisma.assetGroup.create({
    data: { name: "GAP IT Equipment" },
  });
  console.log(`  AssetGroup created: ${assetGroup.name} (id=${assetGroup.id})`);

  // AssetBrand + AssetBrandModel
  const assetBrand = await prisma.assetBrand.create({
    data: { name: "GAP Brand Lenovo" },
  });
  const assetBrandModel = await prisma.assetBrandModel.create({
    data: { assetBrandId: assetBrand.id, name: "ThinkPad X1 Carbon" },
  });
  console.log(`  AssetBrand: ${assetBrand.name}, Model: ${assetBrandModel.name}`);

  // Asset (active)
  const asset1 = await prisma.asset.create({
    data: {
      code: "GAP-AST-001",
      name: "GAP Laptop #1",
      categoryId: assetCategory.id,
      groupId: assetGroup.id,
      assetBrandId: assetBrand.id,
      assetBrandModelId: assetBrandModel.id,
      purchaseDate: new Date("2025-01-15"),
      purchaseCost: 15000000,
      currentValue: 12000000,
      residualValue: 3000000,
      location: "Office A",
      status: "active",
      condition: "good",
      employeeId: employee.id,
    },
  });
  console.log(`  Asset (active): ${asset1.name} (id=${asset1.id})`);

  // Asset (disposed)
  const asset2 = await prisma.asset.create({
    data: {
      code: "GAP-AST-002",
      name: "GAP Old Printer",
      categoryId: assetCategory.id,
      groupId: assetGroup.id,
      purchaseDate: new Date("2020-06-01"),
      purchaseCost: 5000000,
      currentValue: 0,
      residualValue: 500000,
      location: "Storage",
      status: "disposed",
      condition: "poor",
    },
  });

  // Asset (maintenance)
  const asset3 = await prisma.asset.create({
    data: {
      code: "GAP-AST-003",
      name: "GAP Server Rack",
      categoryId: assetCategory.id,
      groupId: assetGroup.id,
      purchaseDate: new Date("2023-03-10"),
      purchaseCost: 25000000,
      currentValue: 20000000,
      residualValue: 5000000,
      location: "Server Room",
      status: "maintenance",
      condition: "fair",
    },
  });
  console.log(`  Assets created: active=${asset1.id}, disposed=${asset2.id}, maintenance=${asset3.id}`);

  // AssetHistory
  const history1 = await prisma.assetHistory.create({
    data: { assetId: asset1.id, type: "purchase", description: "Initial purchase", amount: 15000000, date: new Date("2025-01-15") },
  });
  const history2 = await prisma.assetHistory.create({
    data: { assetId: asset1.id, type: "depreciation", description: "Monthly depreciation", amount: 250000, date: new Date("2025-02-15") },
  });
  const history3 = await prisma.assetHistory.create({
    data: { assetId: asset3.id, type: "maintenance", description: "Fan replacement", amount: 500000, date: new Date("2026-01-10") },
  });
  const history4 = await prisma.assetHistory.create({
    data: { assetId: asset2.id, type: "disposal", description: "Sold to recycler", amount: 200000, date: new Date("2026-03-01") },
  });
  console.log(`  AssetHistory: purchase=${history1.id}, depreciation=${history2.id}, maintenance=${history3.id}, disposal=${history4.id}`);

  // AssetTransfer
  const transfer = await prisma.assetTransfer.create({
    data: {
      assetId: asset1.id,
      fromLocation: "Office A",
      toLocation: "Office B",
      fromEmployeeId: employee.id,
      toEmployeeId: employee2.id,
      transferDate: new Date("2026-04-01"),
      notes: "Employee relocation",
      createdBy: user.id,
    },
  });
  console.log(`  AssetTransfer: id=${transfer.id} (${transfer.fromLocation} → ${transfer.toLocation})`);
  assert(transfer.fromEmployeeId === employee.id, "fromEmployeeId mismatch");
  assert(transfer.toEmployeeId === employee2.id, "toEmployeeId mismatch");

  console.log("  Asset Management ✓\n");

  // ═══════════════════════════════════════════════════════════════════════
  // 2. MANUFACTURING
  // ═══════════════════════════════════════════════════════════════════════
  console.log("── 2. Manufacturing ──");

  // Product
  const product = await prisma.product.create({
    data: {
      code: "GAP-PRD-001",
      name: "GAP Assembled Widget",
      sku: "GAP-SKU-WIDGET",
      standardCost: 80000,
      description: "Assembled from raw materials",
    },
  });
  console.log(`  Product created: ${product.name} (id=${product.id})`);

  // ProductMaterial (BOM)
  const bom1 = await prisma.productMaterial.create({
    data: { productId: product.id, itemId: item.id, qty: 2 },
  });
  const bom2 = await prisma.productMaterial.create({
    data: { productId: product.id, itemId: item2.id, qty: 3 },
  });
  console.log(`  BOM: material1=${bom1.id} (qty=2), material2=${bom2.id} (qty=3)`);

  // ProductionOrder (draft → in_progress → completed)
  const prodOrder = await prisma.productionOrder.create({
    data: {
      documentNo: await generateDocumentNumber("MO"),
      productId: product.id,
      qty: 10,
      status: "draft",
      startDate: new Date("2026-05-20"),
      notes: "GAP seed production order",
      totalStandardCost: 800000,
      createdBy: user.id,
    },
  });
  console.log(`  ProductionOrder (draft): ${prodOrder.documentNo} (id=${prodOrder.id})`);
  assert(prodOrder.status === "draft", "Initial status should be draft");

  // Update to in_progress
  const prodOrderInProgress = await prisma.productionOrder.update({
    where: { id: prodOrder.id },
    data: { status: "in_progress", startDate: new Date("2026-05-21") },
  });
  assert(prodOrderInProgress.status === "in_progress", "Status should be in_progress");
  console.log(`  ProductionOrder updated → in_progress`);

  // ProductionOrderMaterial
  const prodMat1 = await prisma.productionOrderMaterial.create({
    data: {
      productionOrderId: prodOrder.id,
      itemId: item.id,
      qty: 20,
      actualQty: 21,
      standardCost: 30000,
      actualCost: 31000,
    },
  });
  const prodMat2 = await prisma.productionOrderMaterial.create({
    data: {
      productionOrderId: prodOrder.id,
      itemId: item2.id,
      qty: 30,
      actualQty: 30,
      standardCost: 15000,
      actualCost: 15000,
    },
  });
  console.log(`  ProductionOrderMaterials: mat1=${prodMat1.id}, mat2=${prodMat2.id}`);

  // Complete the order
  const prodOrderCompleted = await prisma.productionOrder.update({
    where: { id: prodOrder.id },
    data: {
      status: "completed",
      endDate: new Date("2026-05-25"),
      totalActualCost: 1101000,
    },
  });
  assert(prodOrderCompleted.status === "completed", "Status should be completed");
  console.log(`  ProductionOrder updated → completed`);

  console.log("  Manufacturing ✓\n");

  // ═══════════════════════════════════════════════════════════════════════
  // 3. PURCHASE REQUEST → PO FLOW
  // ═══════════════════════════════════════════════════════════════════════
  console.log("── 3. Purchase Request → PO Flow ──");

  // PurchaseRequest (draft)
  const prDocNo = await generateDocumentNumber("PR");
  const purchaseRequest = await prisma.purchaseRequest.create({
    data: {
      documentNo: prDocNo,
      requestedBy: user.id,
      date: new Date("2026-05-20"),
      requestDate: new Date("2026-05-20"),
      title: "GAP Material Request",
      description: "Request for production materials",
      status: "draft",
      createdBy: user.id,
    },
  });
  console.log(`  PurchaseRequest (draft): ${purchaseRequest.documentNo} (id=${purchaseRequest.id})`);
  assert(purchaseRequest.status === "draft", "PR should start as draft");

  // PurchaseRequestItem
  const prItem1 = await prisma.purchaseRequestItem.create({
    data: { purchaseRequestId: purchaseRequest.id, itemId: item.id, qty: 50, notes: "Urgent" },
  });
  const prItem2 = await prisma.purchaseRequestItem.create({
    data: { purchaseRequestId: purchaseRequest.id, itemId: item2.id, qty: 100 },
  });
  console.log(`  PurchaseRequestItems: item1=${prItem1.id} (qty=50), item2=${prItem2.id} (qty=100)`);

  // Approve the PR
  const prApproved = await prisma.purchaseRequest.update({
    where: { id: purchaseRequest.id },
    data: { status: "approved", approvedBy: user.id, approvedAt: new Date() },
  });
  assert(prApproved.status === "approved", "PR should be approved");
  console.log(`  PurchaseRequest updated → approved`);

  // Link to PurchaseOrder
  const poDocNo = await generateDocumentNumber("PO");
  const purchaseOrder = await prisma.purchaseOrder.create({
    data: {
      documentNo: poDocNo,
      vendorId: vendor.id,
      purchaseRequestId: purchaseRequest.id,
      date: new Date("2026-05-22"),
      expectedDate: new Date("2026-06-01"),
      subtotal: 5000000,
      discount: 0,
      tax: 550000,
      grandTotal: 5550000,
      totalAmount: 5550000,
      status: "draft",
      description: "PO from GAP PR",
      createdBy: user.id,
    },
  });
  console.log(`  PurchaseOrder: ${purchaseOrder.documentNo} (id=${purchaseOrder.id})`);
  assert(purchaseOrder.purchaseRequestId === purchaseRequest.id, "PO should link to PR");

  // Verify linkage
  const prWithPO = await prisma.purchaseRequest.findUnique({
    where: { id: purchaseRequest.id },
    include: { purchaseOrders: true },
  });
  assert(prWithPO?.purchaseOrders.length === 1, "PR should have 1 linked PO");
  console.log(`  PR→PO linkage verified ✓`);

  console.log("  Purchase Request → PO Flow ✓\n");

  // ═══════════════════════════════════════════════════════════════════════
  // 4. BANK RECONCILIATION
  // ═══════════════════════════════════════════════════════════════════════
  console.log("── 4. Bank Reconciliation ──");

  // BankStatement
  const bankStatement = await prisma.bankStatement.create({
    data: {
      accountId: cashAccount.id,
      date: new Date("2026-05-01"),
      periodStart: new Date("2026-05-01"),
      periodEnd: new Date("2026-05-31"),
      openingBalance: 50000000,
      closingBalance: 55000000,
      totalDebits: 10000000,
      totalCredits: 15000000,
      status: "draft",
      notes: "GAP May 2026 statement",
    },
  });
  console.log(`  BankStatement created: id=${bankStatement.id}, opening=${bankStatement.openingBalance}, closing=${bankStatement.closingBalance}`);

  // BankStatementLine (unmatched)
  const bsLine1 = await prisma.bankStatementLine.create({
    data: {
      bankStatementId: bankStatement.id,
      date: new Date("2026-05-05"),
      description: "Customer payment received",
      amount: 5000000,
      debit: 5000000,
      credit: 0,
      balance: 55000000,
      type: "credit_transfer",
      reference: "TRF-001",
      status: "unmatched",
    },
  });
  const bsLine2 = await prisma.bankStatementLine.create({
    data: {
      bankStatementId: bankStatement.id,
      date: new Date("2026-05-10"),
      description: "Vendor payment sent",
      amount: 3000000,
      debit: 0,
      credit: 3000000,
      balance: 52000000,
      type: "debit_transfer",
      reference: "TRF-002",
      status: "unmatched",
    },
  });
  console.log(`  BankStatementLines: line1=${bsLine1.id} (unmatched), line2=${bsLine2.id} (unmatched)`);

  // Match line1
  const bsLine1Matched = await prisma.bankStatementLine.update({
    where: { id: bsLine1.id },
    data: { status: "matched", matchedType: "journal" },
  });
  assert(bsLine1Matched.status === "matched", "Line1 should be matched");
  console.log(`  BankStatementLine1 updated → matched`);

  // BankReconciliation (draft)
  const bankRecon = await prisma.bankReconciliation.create({
    data: {
      reconciliationNumber: await generateDocumentNumber("REC", "simple"),
      accountId: cashAccount.id,
      bankStatementId: bankStatement.id,
      statementDate: new Date("2026-05-31"),
      statementBalance: 55000000,
      bookBalance: 54500000,
      difference: 500000,
      outstandingDeposits: 500000,
      outstandingPayments: 0,
      adjustedBookBalance: 55000000,
      status: "draft",
      notes: "GAP reconciliation May 2026",
      createdBy: user.id,
    },
  });
  console.log(`  BankReconciliation (draft): ${bankRecon.reconciliationNumber} (id=${bankRecon.id})`);

  // BankReconciliationItem
  const reconItem1 = await prisma.bankReconciliationItem.create({
    data: {
      bankReconciliationId: bankRecon.id,
      bankStatementLineId: bsLine1.id,
      amount: 5000000,
      matched: true,
      cleared: true,
      clearedDate: new Date("2026-05-05"),
      description: "Matched customer payment",
    },
  });
  const reconItem2 = await prisma.bankReconciliationItem.create({
    data: {
      bankReconciliationId: bankRecon.id,
      bankStatementLineId: bsLine2.id,
      amount: 3000000,
      matched: false,
      cleared: false,
      description: "Pending vendor payment match",
    },
  });
  console.log(`  BankReconciliationItems: item1=${reconItem1.id} (matched/cleared), item2=${reconItem2.id} (unmatched)`);

  // Complete reconciliation
  const bankReconCompleted = await prisma.bankReconciliation.update({
    where: { id: bankRecon.id },
    data: { status: "completed", completedBy: user.id, completedAt: new Date() },
  });
  assert(bankReconCompleted.status === "completed", "Reconciliation should be completed");
  console.log(`  BankReconciliation updated → completed`);

  console.log("  Bank Reconciliation ✓\n");

  // ═══════════════════════════════════════════════════════════════════════
  // 5. BUDGET
  // ═══════════════════════════════════════════════════════════════════════
  console.log("── 5. Budget ──");

  // CostCenter
  const costCenter = await prisma.costCenter.create({
    data: {
      code: "GAP-CC-001",
      name: "GAP Operations Dept",
      description: "Main operations cost center",
      isActive: true,
    },
  });
  console.log(`  CostCenter created: ${costCenter.code} - ${costCenter.name} (id=${costCenter.id})`);
  assert(costCenter.isActive === true, "CostCenter should be active");

  // ProfitCenter
  const profitCenter = await prisma.profitCenter.create({
    data: {
      code: "GAP-PC-001",
      name: "GAP Revenue Stream A",
    },
  });
  console.log(`  ProfitCenter created: ${profitCenter.code} - ${profitCenter.name} (id=${profitCenter.id})`);

  // Budget (with costCenter)
  const budget1 = await prisma.budget.create({
    data: {
      name: "GAP Ops Budget Q2 2026",
      accountId: expenseAccount.id,
      costCenterId: costCenter.id,
      amount: 50000000,
      startDate: new Date("2026-04-01"),
      endDate: new Date("2026-06-30"),
      createdBy: user.id,
    },
  });
  console.log(`  Budget (with costCenter): ${budget1.name} amount=${budget1.amount} (id=${budget1.id})`);
  assert(budget1.costCenterId === costCenter.id, "Budget should link to costCenter");

  // Budget (without costCenter)
  const budget2 = await prisma.budget.create({
    data: {
      name: "GAP General Budget 2026",
      accountId: cashAccount.id,
      costCenterId: null,
      amount: 100000000,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      createdBy: user.id,
    },
  });
  console.log(`  Budget (no costCenter): ${budget2.name} amount=${budget2.amount} (id=${budget2.id})`);
  assert(budget2.costCenterId === null, "Budget2 costCenterId should be null");

  console.log("  Budget ✓\n");

  // ═══════════════════════════════════════════════════════════════════════
  // 6. APPROVAL WORKFLOW
  // ═══════════════════════════════════════════════════════════════════════
  console.log("── 6. Approval Workflow ──");

  // ApprovalWorkflow
  const workflow = await prisma.approvalWorkflow.create({
    data: {
      name: "GAP PO Approval Workflow",
      code: "GAP-WF-PO",
      modelType: "PurchaseOrder",
      description: "Two-step approval for purchase orders",
      isActive: true,
      priority: 1,
    },
  });
  console.log(`  ApprovalWorkflow created: ${workflow.name} (id=${workflow.id}, modelType=${workflow.modelType})`);
  assert(workflow.isActive === true, "Workflow should be active");

  // ApprovalWorkflowStep (role-based step 1)
  const step1 = await prisma.approvalWorkflowStep.create({
    data: {
      workflowId: workflow.id,
      name: "Manager Approval",
      stepOrder: 1,
      approverType: "role",
      roleId: 1,
      canSkip: false,
    },
  });
  // ApprovalWorkflowStep (user-based step 2)
  const step2 = await prisma.approvalWorkflowStep.create({
    data: {
      workflowId: workflow.id,
      name: "Director Final Approval",
      stepOrder: 2,
      approverType: "user",
      userId: user.id,
      canSkip: false,
    },
  });
  console.log(`  WorkflowSteps: step1=${step1.id} (role, order=1), step2=${step2.id} (user, order=2)`);

  // Approval (pending → approved)
  const approval = await prisma.approval.create({
    data: {
      workflowId: workflow.id,
      referenceType: "PurchaseOrder",
      referenceId: purchaseOrder.id,
      currentStep: 1,
      status: "pending",
      requestedBy: user.id,
      requestedAt: new Date(),
    },
  });
  console.log(`  Approval (pending): id=${approval.id}, referenceType=${approval.referenceType}, referenceId=${approval.referenceId}`);
  assert(approval.status === "pending", "Approval should start as pending");

  // ApprovalHistory - step 1 approve
  const approvalHist1 = await prisma.approvalHistory.create({
    data: {
      approvalId: approval.id,
      step: 1,
      action: "approve",
      userId: user.id,
      notes: "Approved by manager",
    },
  });
  console.log(`  ApprovalHistory step1: id=${approvalHist1.id}, action=${approvalHist1.action}`);

  // Move to step 2
  await prisma.approval.update({
    where: { id: approval.id },
    data: { currentStep: 2 },
  });

  // ApprovalHistory - step 2 approve
  const approvalHist2 = await prisma.approvalHistory.create({
    data: {
      approvalId: approval.id,
      step: 2,
      action: "approve",
      userId: user.id,
      notes: "Final approval by director",
    },
  });
  console.log(`  ApprovalHistory step2: id=${approvalHist2.id}, action=${approvalHist2.action}`);

  // Complete approval
  const approvalCompleted = await prisma.approval.update({
    where: { id: approval.id },
    data: {
      status: "approved",
      finalApprovedBy: user.id,
      completedAt: new Date(),
    },
  });
  assert(approvalCompleted.status === "approved", "Approval should be approved");
  console.log(`  Approval updated → approved`);

  // Verify full workflow chain
  const fullApproval = await prisma.approval.findUnique({
    where: { id: approval.id },
    include: { histories: true, workflow: { include: { steps: true } } },
  });
  assert(fullApproval?.histories.length === 2, "Should have 2 approval history entries");
  assert(fullApproval?.workflow.steps.length === 2, "Workflow should have 2 steps");
  console.log(`  Approval workflow chain verified ✓`);

  console.log("  Approval Workflow ✓\n");

  // ═══════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════");
  console.log("  ALL GAP MODULES SEEDED & VERIFIED SUCCESSFULLY");
  console.log("═══════════════════════════════════════════════════");
  console.log("\nModules covered:");
  console.log("  1. Asset Management (Category, Group, Brand, BrandModel, Asset x3, History x4, Transfer)");
  console.log("  2. Manufacturing (Product, BOM x2, ProductionOrder draft→in_progress→completed, Materials x2)");
  console.log("  3. Purchase Request → PO (PR draft→approved, PRItems x2, PO linked)");
  console.log("  4. Bank Reconciliation (Statement, Lines x2, Reconciliation draft→completed, Items x2)");
  console.log("  5. Budget (CostCenter, ProfitCenter, Budget x2)");
  console.log("  6. Approval Workflow (Workflow, Steps x2, Approval pending→approved, History x2)");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
