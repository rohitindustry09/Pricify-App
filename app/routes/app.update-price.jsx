// app/routes/app.breakdown.jsx

import { useLoaderData, useFetcher } from "react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  Modal,
  TextField,
  FormLayout,
  Toast,
  Frame,
  Grid,
  BlockStack,
  InlineStack,
  Badge,
  IndexTable,
  Icon,
  Divider,
  Pagination,
  Select,
} from "@shopify/polaris";
import {
  EditIcon,
  AlertCircleIcon,
  CheckIcon,
  ComposeIcon,
} from "@shopify/polaris-icons";
import shopify from "../shopify.server";
import {
  calculatePriceFromRate,
  summarizeSelectedCollections,
  parseWeightFromOptions,
} from "../utils/jewelry-pricing";

export const meta = () => [{ title: "Jewelry Price Manager" }];

/**
 * THEME HELPER
 */
function getThemeStyles(title) {
  const t = title.toLowerCase();

  const base = {
    padding: "16px",
    borderRadius: "16px",
    border: "1px solid #e5e7eb",
    cursor: "pointer",
    transition: "transform 0.2s, box-shadow 0.2s",
    boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
    height: "100%",
    position: "relative"
  };

  if (t.includes("24k") || t.includes("gold")) {
    return { ...base, background: "#fef3c7", borderColor: "#fbbf24", color: "#451a03" };
  }
  if (t.includes("silver") || t.includes("925")) {
    return { ...base, background: "#f3f4f6", borderColor: "#d4d4d8", color: "#1f2937" };
  }
  if (t.includes("platinum") || t.includes("pt")) {
    return { ...base, background: "#e5e7eb", borderColor: "#cbd5f5", color: "#1e1b4b" };
  }
  if (t.includes("diamond")) {
    return { ...base, background: "#e0f2fe", borderColor: "#93c5fd", color: "#0c4a6e" };
  }

  // Neutral/Default
  return { ...base, background: "#fef9c3", borderColor: "#e5e7eb", color: "#111827" };
}

// Loader
export async function loader({ request }) {
  const { admin } = await shopify.authenticate.admin(request);
  const response = await admin.graphql(
    `#graphql
      query CollectionsWithProducts {
        collections(first: 50) {
          edges {
            node {
              id
              title
              handle
              products(first: 50) {
                edges {
                  node {
                    id
                    title
                    handle
                    status
                    variants(first: 50) {
                      edges {
                        node {
                          id
                          title
                          price
                          selectedOptions { name value }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `
  );
  const body = await response.json();
  const collections = body.data?.collections?.edges?.map(({ node }) => {
    const products = node.products?.edges?.flatMap(({ node: p }) => {
      const variants = p.variants?.edges ?? [];
      if (variants.length === 0) return [];
      return variants.map(({ node: v }) => {
        const basePrice = Number(v?.price ?? 0);
        const weightGrams = parseWeightFromOptions(v?.selectedOptions ?? []);
        return {
          id: `${p.id}::${v.id}`,
          productId: p.id,
          variantId: v.id,
          title: p.title,
          variantTitle: v.title,
          basePrice,
          weightGrams,
        };
      });
    }) ?? [];
    return { id: node.id, title: node.title, products };
  }) ?? [];
  return { collections };
}

export default function UpdatePrice() {
  const { collections } = useLoaderData();
  const fetcher = useFetcher();

  // State
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectionDone, setSelectionDone] = useState(false);
  const [pricing, setPricing] = useState(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem("jpm_pricing");
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  const [modalCollectionId, setModalCollectionId] = useState(null);
  const [modalRate, setModalRate] = useState("0");
  const [modalPercent, setModalPercent] = useState("0");
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [toast, setToast] = useState(null);

  // --- Pagination State ---
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // --- Button Feedback State ---
  const [buttonStatus, setButtonStatus] = useState("idle"); // 'idle' | 'loading' | 'success'

  // --- NEW: Filter State ---
  const [filterCollectionId, setFilterCollectionId] = useState("");

  // Computed
  const selectedCollections = useMemo(
    () => collections.filter((c) => selectedIds.includes(c.id)),
    [collections, selectedIds]
  );
  const stats = useMemo(() => summarizeSelectedCollections(selectedCollections), [selectedCollections]);

  const invalidCollections = useMemo(() => selectedCollections.filter(c => {
    const conf = pricing[c.id];
    return !conf || !(conf.ratePerGram > 0);
  }), [selectedCollections, pricing]);
  const hasInvalidPricing = invalidCollections.length > 0;

  // --- NEW: Filter Options for Select ---
  const filterOptions = useMemo(() => [
    { label: 'All Collections', value: '' },
    ...selectedCollections.map(c => ({ label: c.title, value: c.id }))
  ], [selectedCollections]);

  // --- 1. Flatten Data (Original Order) ---
  const allFlattenedRows = useMemo(() => {
    let rowIndex = 0;
    const rows = [];

    selectedCollections.forEach(col => {
      const { ratePerGram, percent } = pricing[col.id] || { ratePerGram: 0, percent: 0 };
      const groups = {};

      col.products.forEach(p => {
        const key = `${p.productId}-${p.weightGrams}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
      });

      Object.values(groups).forEach((groupVariants) => {
        const first = groupVariants[0];

        // Calculate Price: Round Down (remove decimals)
        const calculated = first.weightGrams
          ? calculatePriceFromRate(first.weightGrams, ratePerGram, percent)
          : first.basePrice;

        const newPrice = Math.floor(calculated);

        groupVariants.forEach((v, idx) => {
          rowIndex++;
          rows.push({
            uniqueKey: `${col.id}-${v.variantId}`,
            sNo: rowIndex,
            variantId: v.variantId,
            productId: v.productId,
            title: v.title,
            variantTitle: v.variantTitle,
            collectionId: col.id,
            collectionTitle: col.title,
            weightGrams: v.weightGrams,
            ratePerGram,
            percent,
            basePrice: v.basePrice,
            newPrice,
            isFirstInGroup: idx === 0,
            hasWeight: !!v.weightGrams
          });
        });
      });
    });

    return rows;
  }, [selectedCollections, pricing]);

  // --- NEW: Sorted/Filtered Rows for Display ---
  const sortedFlattenedRows = useMemo(() => {
    if (!filterCollectionId) {
      return allFlattenedRows;
    }

    const priorityCollection = selectedCollections.find(c => c.id === filterCollectionId);
    if (!priorityCollection) {
      return allFlattenedRows;
    }

    // Sort: filtered collection first, then others (maintaining original order within groups)
    const sorted = [...allFlattenedRows].sort((a, b) => {
      const aIsPriority = a.collectionId === filterCollectionId;
      const bIsPriority = b.collectionId === filterCollectionId;

      if (aIsPriority && !bIsPriority) return -1;
      if (!aIsPriority && bIsPriority) return 1;
      return 0;
    });

    // Re-assign sNo for display based on sorted order
    return sorted.map((row, idx) => ({
      ...row,
      sNo: idx + 1
    }));
  }, [allFlattenedRows, filterCollectionId, selectedCollections]);

  // --- Pagination Logic (uses sorted rows) ---
  const totalItems = sortedFlattenedRows.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  // Reset pagination and filter when selection changes
  useEffect(() => {
    setCurrentPage(1);
    setFilterCollectionId("");
  }, [selectedIds.length]);

  const currentTableRows = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return sortedFlattenedRows.slice(start, end);
  }, [sortedFlattenedRows, currentPage]);

  // --- Calculate Changes (uses original allFlattenedRows for accurate count) ---
  const changedVariantsCount = useMemo(() => {
    return allFlattenedRows.reduce((acc, row) => {
      if (row.ratePerGram > 0 && row.hasWeight && Math.abs(row.newPrice - row.basePrice) >= 1) {
        return acc + 1;
      }
      return acc;
    }, 0);
  }, [allFlattenedRows]);

  const allSelected = collections.length > 0 && selectedIds.length === collections.length;

  // Effects
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("jpm_pricing", JSON.stringify(pricing));
    }
  }, [pricing]);

  useEffect(() => {
    setPricing((prev) => {
      const next = { ...prev };
      collections.forEach((c) => {
        if (!next[c.id]) next[c.id] = { ratePerGram: 0, percent: 0 };
      });
      return next;
    });
  }, [collections]);

  // --- Button Feedback Logic ---
  useEffect(() => {
    if (fetcher.state === "submitting") {
      setButtonStatus("loading");
    }
    else if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.ok) {
        setButtonStatus("success");
        setToast({ error: false, message: `Successfully updated ${fetcher.data.updated} variants.` });
        setLastUpdated(new Date());

        const timer = setTimeout(() => {
          setButtonStatus("idle");
        }, 2000);
        return () => clearTimeout(timer);
      } else {
        setButtonStatus("idle");
        setToast({ error: true, message: "Failed to update some prices." });
      }
    }
  }, [fetcher.state, fetcher.data]);

  // Actions
  const toggleCollection = (id) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(collections.map(c => c.id));
    }
  };

  const handleSelectionDone = () => {
    if (selectedIds.length === 0) setToast({ error: true, message: "Select a collection first." });
    else setSelectionDone(true);
  };

  const handleReselect = () => {
    setSelectionDone(false);
  };

  const openModal = (id) => {
    setModalCollectionId(id);
    const curr = pricing[id] ?? { ratePerGram: 0, percent: 0 };
    setModalRate(String(curr.ratePerGram));
    setModalPercent(String(curr.percent));
  };

  const handleSavePricing = () => {
    const rate = Number(modalRate);
    if (!rate || rate <= 0) {
      setToast({ error: true, message: "Enter a valid positive rate." });
      return;
    }
    setPricing(prev => ({ ...prev, [modalCollectionId]: { ratePerGram: rate, percent: Number(modalPercent) } }));
    setModalCollectionId(null);
  };

  const handleApplyPrices = () => {
    // Use allFlattenedRows (not sorted) to apply ALL changes
    const changes = [];
    allFlattenedRows.forEach(row => {
      if (row.hasWeight && row.ratePerGram > 0 && Math.abs(row.newPrice - row.basePrice) >= 1) {
        changes.push({ productId: row.productId, variantId: row.variantId, newPrice: row.newPrice });
      }
    });

    if (changes.length === 0) return setToast({ error: false, message: "No price changes detected." });
    fetcher.submit({ changes: JSON.stringify(changes) }, { method: "post", action: "/app/update-prices" });
  };

  // --- Handle Filter Change ---
  const handleFilterChange = (value) => {
    setFilterCollectionId(value);
    setCurrentPage(1); // Reset to first page when filter changes
  };

  // --- Determine Button Icon ---
  const getButtonIcon = () => {
    if (buttonStatus === 'success') {
      return CheckIcon;
    }
    if (buttonStatus === 'loading' || changedVariantsCount > 0) {
      return ComposeIcon;
    }
    return undefined; // No icon for "No Changes Detected"
  };

  // --- Render Table Rows ---
  const tableRowsMarkup = currentTableRows.map((row, index) => (
    <IndexTable.Row key={row.uniqueKey} id={row.variantId} position={index}>
      <IndexTable.Cell>
        <div style={{ textAlign: 'center', width: '100%' }}>
          {row.sNo}
        </div>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {row.isFirstInGroup ? (
          <Text fontWeight="bold" as="span">
            {row.title} {row.weightGrams ? `(${row.weightGrams}g)` : ''}
          </Text>
        ) : null}
        <div style={{ paddingLeft: row.isFirstInGroup ? 0 : '16px', color: '#6b7280', fontSize: '13px' }}>
          {row.isFirstInGroup ? '' : '↳ '}{row.variantTitle === 'Default Title' ? 'Standard' : row.variantTitle}
        </div>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          {row.collectionTitle}
          {filterCollectionId && row.collectionId === filterCollectionId && (
            <Badge tone="info" size="small">★</Badge>
          )}
        </div>
      </IndexTable.Cell>
      <IndexTable.Cell>{row.weightGrams ? `${row.weightGrams}g` : '—'}</IndexTable.Cell>
      <IndexTable.Cell>₹{row.ratePerGram}/g</IndexTable.Cell>
      <IndexTable.Cell>{row.percent > 0 ? `+${row.percent}%` : `${row.percent}%`}</IndexTable.Cell>
      <IndexTable.Cell>₹{row.basePrice.toLocaleString()}</IndexTable.Cell>
      <IndexTable.Cell>
        <Text fontWeight="bold" tone="success">₹{row.newPrice.toLocaleString()}</Text>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));


  return (
    <Frame>
      <Page fullWidth>

        <Layout>
          {/* 1. HEADER */}
          <Layout.Section>
            <div
              style={{
                border: "1px solid #000000",
                background: "#ffffff",
                borderRadius: "12px",
                padding: "40px 20px",
                textAlign: "center",
                marginBottom: "20px",
                boxShadow: "0px 4px 6px rgba(0,0,0,0.1)",
              }}
            >
              <BlockStack gap="200">
                <Text as="h1" variant="heading2xl">
                  Jewellery Price Manager
                </Text>
                <Text as="p" variant="bodyLg">
                  The command center for automating your daily Gold and Silver pricing updates.
                </Text>
              </BlockStack>
            </div>
          </Layout.Section>

          {/* 2. Collection Selector */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text variant="headingMd" as="h2">Select Collections</Text>
                    <Text variant="bodySm" tone="subdued">Choose collections to manage rates</Text>
                  </BlockStack>
                  <InlineStack gap="200">
                    <Button variant="plain" onClick={toggleSelectAll} disabled={selectionDone}>
                      {allSelected ? "Deselect All" : "Select All"}
                    </Button>
                    <Button
                      variant={selectionDone ? "secondary" : "primary"}
                      onClick={selectionDone ? handleReselect : handleSelectionDone}
                      disabled={selectedIds.length === 0}
                    >
                      {selectionDone ? "Re-select" : "Done"}
                    </Button>
                  </InlineStack>
                </InlineStack>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {collections.map(c => {
                    const isSelected = selectedIds.includes(c.id);
                    return (
                      <div key={c.id} style={{ opacity: selectionDone && !isSelected ? 0.5 : 1 }}>
                        <Button
                          size="slim"
                          variant={isSelected ? "primary" : "secondary"}
                          onClick={() => !selectionDone && toggleCollection(c.id)}
                          disabled={selectionDone}
                          icon={isSelected ? CheckIcon : undefined}
                        >
                          {c.title}
                        </Button>
                      </div>
                    )
                  })}
                </div>

                {/* SUMMARY BOX */}
                {selectedIds.length > 0 && (
                  <div style={{
                    marginTop: '12px',
                    padding: '16px',
                    background: '#f7f7f7',
                    borderRadius: '8px',
                    border: '1px solid #e1e3e5'
                  }}>
                    <BlockStack gap="200">
                      <Text variant="headingSm" as="h4">Selection Summary</Text>
                      {selectedCollections.map(c => (
                        <InlineStack key={c.id} align="space-between">
                          <Text variant="bodyMd">{c.title}</Text>
                          <Text variant="bodyMd" tone="subdued">{c.products.length} Products</Text>
                        </InlineStack>
                      ))}
                      <Divider />
                      <InlineStack align="space-between">
                        <Text fontWeight="bold">Total Selected Products</Text>
                        <Text fontWeight="bold">{stats.totalProducts}</Text>
                      </InlineStack>
                    </BlockStack>
                  </div>
                )}
                <div className={`fade-message ${selectedIds.length > 0 ? "hidden" : ""}`}>
                  <Text tone="subdued" alignment="center">Please select at least one collection to begin.</Text>
                </div>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* 3. Rate Cards Section */}
          {selectionDone && selectedIds.length > 0 && (
            <Layout.Section>
              <div style={{ marginBottom: '20px' }}>
                <Text variant="headingMd" as="h2">Set Metal Rates</Text>
                <Text tone="subdued">Click a card to update rate & markup</Text>
              </div>
              <Grid>
                {selectedCollections.map((c) => {
                  const style = getThemeStyles(c.title);
                  const conf = pricing[c.id];
                  const isInvalid = !conf || conf.ratePerGram <= 0;
                  const finalStyle = isInvalid
                    ? { ...style, background: '#fee2e2', borderColor: '#ef4444', color: '#b91c1c' }
                    : style;

                  return (
                    <Grid.Cell key={c.id} columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3, xl: 3 }}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => openModal(c.id)}
                        onKeyDown={(e) => e.key === 'Enter' && openModal(c.id)}
                        style={finalStyle}
                        className="hover-scale"
                      >
                        <BlockStack gap="200">
                          <InlineStack align="space-between">
                            <Text variant="headingSm" as="h3">{c.title}</Text>
                            <div style={{
                              background: 'rgba(255,255,255,0.5)',
                              borderRadius: '50%',
                              padding: '4px'
                            }}>
                              <Icon source={EditIcon} tone="base" />
                            </div>
                          </InlineStack>
                          <div>
                            <Text variant="headingXl" as="p">
                              ₹{conf?.ratePerGram || 0}
                              <span style={{ fontSize: '14px', fontWeight: 'normal', opacity: 0.7 }}>/g</span>
                            </Text>
                          </div>
                          <InlineStack align="space-between">
                            <Text variant="bodySm">Markup:</Text>
                            <Badge tone={isInvalid ? 'critical' : 'info'}>
                              {conf?.percent > 0 ? '+' : ''}{conf?.percent}%
                            </Badge>
                          </InlineStack>
                          {isInvalid && (
                            <div style={{ marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid rgba(0,0,0,0.1)' }}>
                              <InlineStack gap="100" align="start">
                                <Icon source={AlertCircleIcon} tone="critical" />
                                <Text variant="bodyxs" tone="critical">Set rate to enable updates</Text>
                              </InlineStack>
                            </div>
                          )}
                        </BlockStack>
                      </div>
                    </Grid.Cell>
                  );
                })}
              </Grid>
            </Layout.Section>
          )}

          {/* 4. Table Section */}
          {selectionDone && selectedIds.length > 0 && (
            <Layout.Section>
              <Card padding="0">
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e1e3e5' }}>
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="050">
                      <Text variant="headingMd">Price Preview</Text>
                      <Text tone="subdued" variant="bodySm">
                        Last updated: {lastUpdated.toLocaleTimeString()}
                      </Text>
                    </BlockStack>

                    {/* --- FILTER AND UPDATE BUTTON SECTION --- */}
                    <InlineStack gap="300" blockAlign="center">
                      {/* NEW: Collection Filter Dropdown */}
                      {selectedCollections.length > 1 && (
                        <div style={{ minWidth: '200px' }}>
                          <Select
                            label="Sort by"
                            labelInline
                            options={filterOptions}
                            value={filterCollectionId}
                            onChange={handleFilterChange}
                          />
                        </div>
                      )}

                      {/* --- CUSTOM BUTTON WITH COLOR STATES --- */}
                      <div className={buttonStatus === 'success' ? 'btn-success-container' : 'btn-initial-container'}>
                        <Button
                          icon={getButtonIcon()}
                          size="large"
                          onClick={handleApplyPrices}
                          loading={buttonStatus === 'loading'}
                          disabled={
                            buttonStatus !== 'success' &&
                            (hasInvalidPricing || stats.totalProducts === 0 || changedVariantsCount === 0)
                          }
                        >
                          {buttonStatus === 'success'
                            ? "Updated!"
                            : (changedVariantsCount > 0 ? `Update ${changedVariantsCount} Prices` : "No Changes Detected")
                          }
                        </Button>
                      </div>
                    </InlineStack>
                  </InlineStack>
                </div>

                {stats.totalProducts > 0 ? (
                  <>
                    {/* Filter Active Indicator */}
                    {filterCollectionId && (
                      <div style={{
                        padding: '8px 20px',
                        background: '#f0f9ff',
                        borderBottom: '1px solid #e1e3e5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}>
                        <InlineStack gap="200" blockAlign="center">
                          <Badge tone="info">Sorted</Badge>
                          <Text variant="bodySm">
                            Showing <strong>{selectedCollections.find(c => c.id === filterCollectionId)?.title}</strong> products first
                          </Text>
                        </InlineStack>
                        <Button
                          variant="plain"
                          size="slim"
                          onClick={() => handleFilterChange("")}
                        >
                          Clear filter
                        </Button>
                      </div>
                    )}

                    <IndexTable
                      resourceName={{ singular: 'variant', plural: 'variants' }}
                      itemCount={sortedFlattenedRows.length}
                      headings={[
                        { title: 'S.No', alignment: 'center' },
                        { title: 'Product' },
                        { title: 'Collection' },
                        { title: 'Weight' },
                        { title: 'Rate' },
                        { title: 'Markup' },
                        { title: 'Current' },
                        { title: 'New Price' },
                      ]}
                      selectable={false}
                    >
                      {tableRowsMarkup}
                    </IndexTable>

                    {totalPages > 1 && (
                      <div style={{ display: 'flex', justifyContent: 'center', padding: '16px', borderTop: '1px solid #e1e3e5' }}>
                        <Pagination
                          hasPrevious={currentPage > 1}
                          onPrevious={() => setCurrentPage(prev => prev - 1)}
                          hasNext={currentPage < totalPages}
                          onNext={() => setCurrentPage(prev => prev + 1)}
                          label={`${(currentPage - 1) * itemsPerPage + 1}-${Math.min(currentPage * itemsPerPage, totalItems)} of ${totalItems}`}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ padding: '32px', textAlign: 'center' }}>
                    <Text tone="subdued">No variants found in selected collections.</Text>
                  </div>
                )}
              </Card>
              <div style={{ height: '50px' }}></div>
            </Layout.Section>
          )}
        </Layout>

        {/* Modal for Pricing */}
        <Modal
          open={!!modalCollectionId}
          onClose={() => setModalCollectionId(null)}
          title="Configure Pricing"
          primaryAction={{ content: 'Save', onAction: handleSavePricing }}
          secondaryAction={{ content: 'Cancel', onAction: () => setModalCollectionId(null) }}
        >
          <Modal.Section>
            <FormLayout>
              <Text>
                Setting rates for <strong>{collections.find(c => c.id === modalCollectionId)?.title}</strong>
              </Text>
              <FormLayout.Group>
                <TextField
                  label="Rate per gram (₹)"
                  type="number"
                  value={modalRate}
                  onChange={setModalRate}
                  autoComplete="off"
                  prefix="₹"
                />
                <TextField
                  label="Markup / Increment (%)"
                  type="number"
                  value={modalPercent}
                  onChange={setModalPercent}
                  autoComplete="off"
                  suffix="%"
                  helpText="Example: 10% adds 10% on top of calculated gold value."
                />
              </FormLayout.Group>
            </FormLayout>
          </Modal.Section>
        </Modal>

        {/* Toast */}
        {toast && (
          <Toast content={toast.message} error={toast.error} onDismiss={() => setToast(null)} />
        )}

        {/* CSS for Animations and Custom Button Colors */}
        <style>{`
            .hover-scale:hover { transform: translateY(-4px); box-shadow: 0 10px 20px rgba(0,0,0,0.1) !important; }
            .fade-message { opacity: 1; max-height: 50px; transition: opacity 0.5s ease, max-height 0.5s ease; overflow: hidden; text-align: center; margin-top: 10px; }
            .fade-message.hidden { opacity: 0; max-height: 0; margin-top: 0; }

            /* --- CUSTOM BUTTON STYLING (Overrides Polaris) --- */
            
            /* 1. INITIAL STATE: Light Green */
            .btn-initial-container .Polaris-Button {
               background: #ecfdf5 !important;  /* Light Green (Tailwind emerald-50) */
               border: 1px solid #10b981 !important; /* Green Border (Tailwind emerald-500) */
               color: #065f46 !important; /* Dark Green Text (Tailwind emerald-800) */
               fill: #065f46 !important; /* Icon Color */
            }
            .btn-initial-container .Polaris-Button:hover:not(.Polaris-Button--disabled) {
               background: #d1fae5 !important; /* Slightly darker green on hover */
            }
            .btn-initial-container .Polaris-Button--disabled {
               background: #f1f2f3 !important;
               border-color: #e1e3e5 !important;
               color: #8c9196 !important;
               fill: #8c9196 !important;
               opacity: 0.6;
            }
            
            /* Loading state - keep icon visible */
            .btn-initial-container .Polaris-Button .Polaris-Spinner {
               margin-right: 8px;
            }

            /* 2. SUCCESS STATE: Sky Blue */
            .btn-success-container .Polaris-Button {
               background: #e0f2fe !important; /* Light Sky Blue (Tailwind sky-100) */
               border: 1px solid #0ea5e9 !important; /* Sky Blue Border (Tailwind sky-500) */
               color: #0c4a6e !important; /* Dark Blue Text (Tailwind sky-900) */
               fill: #0c4a6e !important;
            }
            .btn-success-container .Polaris-Button:hover {
               background: #bae6fd !important;
            }
            
            /* Filter select styling */
            .Polaris-Select__Content {
               min-width: 180px;
            }
        `}</style>
      </Page>
    </Frame>
  );
}