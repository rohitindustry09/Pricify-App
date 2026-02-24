// app/routes/app._index.jsx

import { useState, useCallback, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Icon,
  Box,
  Divider,
  Modal,
  TextField,
  FormLayout,
  Tooltip,
  // Removed Toast, Frame
} from "@shopify/polaris";
import {
  CollectionIcon,
  MoneyIcon,
  RefreshIcon,
  CheckIcon,
  ProductIcon,
  AlertDiamondIcon,
  ChatIcon,
  QuestionCircleIcon,
  CashDollarIcon
} from "@shopify/polaris-icons";
import { useLoaderData, useNavigate, useFetcher } from "react-router"; // Added useFetcher
import { useAppBridge } from "@shopify/app-bridge-react"; // Added App Bridge
import { authenticate } from "../shopify.server";

// Loader: Auto-detect the shop name from the session
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

// --- ACTION (Handles the Feedback Form) ---
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  // Extract data
  const data = {
    name: formData.get("name"),
    email: formData.get("email"),
    mobile: formData.get("mobile"),
    shop: formData.get("shop"),
    query: formData.get("query"),
  };

  // TODO: Add your logic here (send email, save to DB, etc.)
  console.log("Feedback received:", data);

  return { status: "success", message: "Feedback sent successfully" };
};

export default function Dashboard() {
  const { shop } = useLoaderData();
  const navigate = useNavigate();
  const shopify = useAppBridge(); // Initialize App Bridge
  const fetcher = useFetcher();   // Initialize Fetcher

  // --- Feedback Modal State ---
  const [activeModal, setActiveModal] = useState(false);
  const handleChange = useCallback(() => setActiveModal((prev) => !prev), []);

  // --- Feedback Form State ---
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [query, setQuery] = useState("");

  // --- UX State ---
  const [isNavigating, setIsNavigating] = useState(false);

  // Calculate loading state based on fetcher
  const isLoading = fetcher.state === "submitting" || fetcher.state === "loading";

  // --- EFFECT: Handle Success Response ---
  useEffect(() => {
    if (fetcher.data?.status === "success") {
      // 1. Show Native App Bridge Toast
      if (shopify?.toast) {
        shopify.toast.show(fetcher.data.message);
      }
      // 2. Close Modal
      setActiveModal(false);

      // 3. Reset Form
      setName("");
      setEmail("");
      setMobile("");
      setQuery("");
    }
  }, [fetcher.data, shopify]);

  // --- Handler for opening price editor ---
  const handleOpenPriceEditor = () => {
    setIsNavigating(true);
    navigate("/app/update-price");
  };

  // --- Validation ---
  const isValid =
    name.trim() &&
    email.trim() &&
    query.trim() &&
    email.includes("@");

  // --- Submit Handler ---
  const handleFeedbackSubmit = () => {
    if (!isValid) {
      shopify.toast.show("Please fill all required fields correctly", { isError: true });
      return;
    }

    // Submit using React Router Fetcher (triggers the 'action' above)
    fetcher.submit(
      { name, email, mobile, shop, query },
      { method: "POST" }
    );
  };

  return (
    // Removed <Frame> wrapper
    <Page fullWidth>
      {/* Removed <Toast /> component */}

      <Layout>
        {/* 1. HEADER: Gradient Background */}
        <Layout.Section>
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #000000",
              borderRadius: "12px",
              padding: "40px 20px",
              textAlign: "center",
              marginBottom: "20px",
            }}
          >
            <BlockStack gap="200">
              <Text as="h1" variant="heading2xl">
                Jewellery Price Manager
              </Text>
              <Text as="p" variant="bodyLg">
                The command center for automating your daily gold and silver pricing updates.
              </Text>
              <div style={{ marginTop: "10px" }}>
                {/* --- 3. MODIFIED BUTTON WITH LOADING --- */}
                <Button
                  size="large"
                  variant="primary"
                  onClick={handleOpenPriceEditor}
                  loading={isNavigating}
                >
                  Open Price Editor
                </Button>
              </div>
            </BlockStack>
          </div>
        </Layout.Section>

        {/* 2. LEFT COLUMN: How it Works */}
        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              {/* Header with Question Mark Icon on the right */}
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingLg">
                  How it Works
                </Text>
                <Tooltip content="Need detailed documentation?">
                  <Icon source={QuestionCircleIcon} tone="subdued" />
                </Tooltip>
              </InlineStack>

              <Text as="p" tone="subdued">
                Follow this exact sequence to ensure your store updates correctly.
              </Text>
              <Divider />

              <BlockStack gap="500">
                {/* Step 1 */}
                <InlineStack align="start" blockAlign="start" gap="400" wrap={false}>
                  <Box background="bg-surface-active" padding="200" borderRadius="200">
                    <Icon source={CollectionIcon} tone="base" />
                  </Box>
                  <BlockStack gap="100">
                    <Text as="h3" variant="headingSm">
                      1. Create & Select Collections
                    </Text>
                    <Text as="p" variant="bodyMd">
                      You must have created Collections (e.g., "Gold", "Silver") in Shopify.
                      Select these in the app to filter updates.
                    </Text>
                  </BlockStack>
                </InlineStack>

                {/* Step 2: Critical Weight Check */}
                <InlineStack align="start" blockAlign="start" gap="400" wrap={false}>
                  <Box background="bg-surface-warning" padding="200" borderRadius="200">
                    <Icon source={AlertDiamondIcon} tone="warning" />
                  </Box>
                  <BlockStack gap="100">
                    <Text as="h3" variant="headingSm">
                      2. Configure Weight Variants (Critical)
                    </Text>
                    <Text as="p" variant="bodyMd">
                      Every product variant <strong>must have a Weight option</strong> (e.g., "2.5g").
                      <br />
                      <Text as="span" tone="critical">
                        Products without a weight variant defined will be skipped.
                      </Text>
                    </Text>
                  </BlockStack>
                </InlineStack>

                {/* Step 3 */}
                <InlineStack align="start" blockAlign="start" gap="400" wrap={false}>
                  <Box background="bg-surface-active" padding="200" borderRadius="200">
                    <Icon source={MoneyIcon} tone="base" />
                  </Box>
                  <BlockStack gap="100">
                    <Text as="h3" variant="headingSm">
                      3. Input Today's Rate
                    </Text>
                    <Text as="p" variant="bodyMd">
                      Enter the current market rate per gram (₹/g) and optional markup.
                    </Text>
                  </BlockStack>
                </InlineStack>

                {/* Step 4 */}
                <InlineStack align="start" blockAlign="start" gap="400" wrap={false}>
                  <Box background="bg-surface-active" padding="200" borderRadius="200">
                    <Icon source={RefreshIcon} tone="base" />
                  </Box>
                  <BlockStack gap="100">
                    <Text as="h3" variant="headingSm">
                      4. Review & Sync
                    </Text>
                    <Text as="p" variant="bodyMd">
                      Preview calculated prices, then click Update to push changes live.
                    </Text>
                  </BlockStack>
                </InlineStack>

                {/* Step 5 */}
                <InlineStack align="start" blockAlign="start" gap="400" wrap={false}>
                  <Box background="bg-surface-active" padding="200" borderRadius="200">
                    <Icon source={CashDollarIcon} tone="base" />
                  </Box>
                  <BlockStack gap="100">
                    <Text as="h3" variant="headingSm">
                      5. Gram-wise Pricing
                    </Text>
                    <div>
                      <div style={{ marginTop: "10px" }}>

                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "8px 14px",
                            background: "#e0f2fe",
                            border: "1px solid #0ea5e9",
                            color: "#0c4a6e",
                            borderRadius: "5px",
                            fontWeight: 600,
                            fontSize: "14px",
                            lineHeight: 1,
                            cursor: "default",
                            userSelect: "none",
                            whiteSpace: "nowrap",
                            textAlign: "center"
                          }}
                        >
                          Method 1
                        </div>
                        <ul style={{ paddingLeft: '20px', margin: '4px 0', listStyleType: 'disc' }}>
                          <li>
                            Create collections named like <strong>Gold 1-10g</strong>,{' '}
                            <strong>Silver 5-10g</strong>, or <strong>Diamond 2-5g</strong>.
                          </li>
                          <li>
                            Create similar name tags in Shopify and add them to the relevant products.
                          </li>
                        </ul>
                      </div>
                      <div style={{ marginTop: "10px" }}>

                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "8px 14px",
                            background: "#e0f2fe",
                            border: "1px solid #0ea5e9",
                            color: "#0c4a6e",
                            borderRadius: "5px",
                            fontWeight: 600,
                            fontSize: "14px",
                            lineHeight: 1,
                            cursor: "default",
                            userSelect: "none",
                            whiteSpace: "nowrap",
                            textAlign: "center"
                          }}
                        >
                          Method 2
                        </div>
                        <ul style={{ paddingLeft: '20px', margin: '4px 0', listStyleType: 'disc' }}>
                          <li>
                            Create collections named like <strong>Gold 1-10g</strong>,{' '}
                            <strong>Silver 5-10g</strong>, or <strong>Diamond 2-5g</strong>.
                          </li>
                          <li>
                            Use Variant Weight with Equal, Less than, Greater than or mix.
                          </li>
                        </ul>
                      </div>
                    </div>
                  </BlockStack>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* 3. RIGHT COLUMN: App Status */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">
                App Status
              </Text>

              <InlineStack gap="200" align="start" blockAlign="center">
                <div style={{ minWidth: "20px" }}>
                  <Icon source={CheckIcon} tone="success" />
                </div>
                <Text as="span" variant="bodyMd">
                  Connected to Shopify
                </Text>
              </InlineStack>

              <InlineStack gap="200" align="start" blockAlign="center">
                <div style={{ minWidth: "20px" }}>
                  <Icon source={ProductIcon} tone="success" />
                </div>
                <Text as="span" variant="bodyMd">
                  Product Read/Write Active
                </Text>
              </InlineStack>

              <Divider />
              <Text as="p" variant="bodyXs" tone="subdued">
                System Ready.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* 4. BOTTOM: Feedback Form (Fixed Layout) */}
        <Layout.Section>
          <div style={{ marginTop: "20px" }}>
            <Card>
              <BlockStack gap="400" align="center" inlineAlign="center">
                <div style={{ padding: "10px", background: "#f1f2f3", borderRadius: "50%" }}>
                  <Icon source={ChatIcon} tone="base" />
                </div>

                <BlockStack gap="200" align="center" inlineAlign="center">
                  <Text as="h2" variant="headingMd">
                    1 min for a feedback
                  </Text>
                  <Text as="p" alignment="center" tone="subdued">
                    We are constantly improving based on your needs. <br />
                    If you have a feature request or found a bug, let us know!
                  </Text>
                </BlockStack>

                <Button onClick={handleChange}>Give us a feedback</Button>
              </BlockStack>
            </Card>
          </div>
        </Layout.Section>
      </Layout>

      {/* --- FEEDBACK MODAL --- */}
      <Modal
        open={activeModal}
        onClose={handleChange}
        title="Share your feedback"
        primaryAction={{
          content: isLoading ? 'Sending...' : 'Submit Feedback', // Use isLoading
          onAction: handleFeedbackSubmit,
          disabled: isLoading,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: handleChange,
            disabled: isLoading,
          },
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Name"
              value={name}
              onChange={setName}
              autoComplete="name"
              placeholder="Your Name"
              requiredIndicator
            />
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              placeholder="name@example.com"
              requiredIndicator
            />
            <TextField
              label="Mobile (Optional)"
              type="tel"
              value={mobile}
              onChange={setMobile}
              autoComplete="tel"
            />
            {/* Auto-detected Store Name */}
            <TextField
              label="Store Name"
              value={shop} // From loader data
              disabled // Read-only
              autoComplete="off"
              helpText="Auto-detected from your session."
            />
            <TextField
              label="Your Query / Feedback"
              value={query}
              onChange={setQuery}
              multiline={4}
              autoComplete="off"
              placeholder="Tell us what you think..."
              requiredIndicator
            />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
