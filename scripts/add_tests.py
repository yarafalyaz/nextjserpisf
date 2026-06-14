import sys

def main():
    with open('src/actions/__tests__/master.actions.test.ts', 'r') as f:
        content = f.read()

    new_tests = """
describe('Next Redirect Error Handling', () => {
  const methods = [
    actions.createCustomer, actions.updateCustomer, actions.deleteCustomer,
    actions.createVendor, actions.updateVendor,
    actions.createItem, actions.updateItem,
    actions.createWarehouse, actions.updateWarehouse,
    actions.createEmployee, actions.updateEmployee,
    actions.createAccount,
    actions.createItemCategory, actions.updateItemCategory,
    actions.createDepartment, actions.updateDepartment,
    actions.createPosition, actions.updatePosition,
    actions.createLead, actions.updateLead,
    actions.createBank, actions.updateBank,
    actions.createTax, actions.updateTax,
    actions.createCurrency, actions.updateCurrency,
    actions.lookupItemByScan, actions.createBarcode, actions.updateBarcode,
    actions.createTaxGroup, actions.updateTaxGroup,
    actions.createStatisticalKeyFigure, actions.updateStatisticalKeyFigure,
    actions.createPaymentTerm, actions.updatePaymentTerm
  ];

  for (const method of methods) {
    it(`${method.name} rethrows NextRedirectError`, async () => {
      const e = new Error("redirect");
      (e as any).digest = "NEXT_REDIRECT_test";
      mocks.requirePermissionMock.mockRejectedValueOnce(e);
      await expect(method(new FormData(), new FormData())).rejects.toThrow();
    });
  }
});

describe('hardDeleteOrSoftDelete Edge Cases', () => {
  it('throws non-P2003 error', async () => {
    mocks.requirePermissionMock.mockResolvedValueOnce({ id: 1, permissions: [] });
    mocks.prismaMock.customer.delete.mockRejectedValueOnce(new Error("Random Error"));
    const res = await actions.deleteCustomer(1);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Random Error");
  });

  it('handles P2003 error by soft deleting', async () => {
    mocks.requirePermissionMock.mockResolvedValueOnce({ id: 1, permissions: [] });
    mocks.prismaMock.customer.delete.mockRejectedValueOnce(makeP2003());
    mocks.prismaMock.customer.update.mockResolvedValueOnce({ id: 1 });
    const res = await actions.deleteCustomer(1);
    expect(res.success).toBe(true);
    expect(mocks.prismaMock.customer.update).toHaveBeenCalled();
  });
});
"""
    if 'Next Redirect Error Handling' not in content:
        with open('src/actions/__tests__/master.actions.test.ts', 'a') as f:
            f.write(new_tests)
        print("Added new tests")
    else:
        print("Tests already exist")

if __name__ == "__main__":
    main()
