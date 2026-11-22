@blocker-margin @pricing
Feature: Combination Discounts and Reverse Recalculation
  As a Business Analyst protecting store margin
  I want combination discounts to apply accurately on mixed retail-and-rental baskets and revoke immediately when eligibility ends
  So that pricing stays free of cent rounding drift and stale benefits never leak margin

  Rule: Combination discount of 15% applies when retail and rental items coexist and reverses on removal

    @api @TC-BDD-002
    Scenario: Mixing a retail product and a rental item applies a 15% combination discount
      Given a shopper starts an empty basket with no regional location set
      When the shopper adds 1 unit of an in-stock retail product to the basket
      And the shopper adds a rental item for 2 hours to the basket
      Then the basket qualifies for the 15 percent combination discount
      And every basket line should keep the exact catalog unit price in cents

    @ui @TC-BDD-003
    Scenario: Removing the rental item in the storefront revokes the 15% combination discount and persists across reload
      Given a shopper adds 2 units of an in-stock retail product in the storefront
      And the shopper adds a rental item in the storefront
      When the shopper opens the storefront checkout cart
      Then the storefront cart should show a 15 percent combination discount and exact discounted total
      When the shopper removes the rental item from the storefront cart
      Then the storefront cart should no longer show a combination discount and total should match the retail line
      When the shopper reloads the checkout cart page
      Then the storefront cart should still show no combination discount and preserve the exact retail total
