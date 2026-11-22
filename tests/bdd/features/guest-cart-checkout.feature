@ui @blocker-conversion @blocker-margin @checkout
Feature: Guest Cart Reconciliation and Checkout Sign-In Continuity
  As a Buyer shopping on Toolshop
  I want catalog prices to match the cart to the exact cent and my guest cart to survive sign-in
  So that I can complete checkout without losing items or seeing unexpected totals

  @TC-BDD-001
  Scenario: Guest adds an in-stock item and retains exact cart totals after signing in at checkout
    Given a registered shopper exists
    And a guest shopper opens an in-stock retail product page in the storefront
    Then the product page should show the exact catalog price in cents
    When the shopper adds 2 units of that product to the cart
    And the shopper opens the storefront checkout cart
    Then the storefront cart should display quantity 2 and exact recalculated totals in cents
    When the shopper proceeds to checkout and signs in as the registered shopper
    Then the checkout should continue to the billing step with the cart badge still showing 2
