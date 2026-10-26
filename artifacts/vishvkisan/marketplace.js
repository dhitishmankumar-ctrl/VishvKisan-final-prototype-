(() => {
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
  const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const priceGuidanceUnits = new Set(['kg', 'quintal', 'ton']);
  function renderPriceCompressionChart(selector, guidance, emptyMessage = 'A price estimate will appear here.') {
    const chart = $(selector);
    if (!chart) return;
    if (!guidance) {
      chart.innerHTML = `<p class="price-chart-empty">${esc(emptyMessage)}</p>`;
      return;
    }
    const askingPrice = Number(guidance.askingPrice);
    const storageFee = Number(guidance.storageNodeFee);
    const retailCap = Number(guidance.regionalRetailCap);
    const compression = Number(guidance.compressionPercent);
    const unit = String(guidance.unit || 'unit');
    if (![askingPrice, storageFee, retailCap, compression].every(Number.isFinite) || askingPrice < 0 || storageFee < 0 || retailCap <= 0) {
      chart.innerHTML = '<p class="price-chart-empty">The service returned incomplete price guidance. No chart is shown.</p>';
      return;
    }
    const effectivePrice = askingPrice + storageFee;
    const scale = Math.max(retailCap, effectivePrice, 0.01);
    const askingWidth = askingPrice / scale * 100;
    const storageWidth = storageFee / scale * 100;
    const headroom = Math.max(retailCap - effectivePrice, 0);
    const headroomWidth = headroom / scale * 100;
    const capMarker = Math.min(retailCap / scale * 100, 100);
    const overCap = effectivePrice > retailCap;
    const compressionLabel = compression < 0
      ? `${Math.abs(compression).toFixed(1)}% above cap`
      : `${compression.toFixed(1)}% headroom`;
    const ariaLabel = `Price compression chart per ${unit}. Seller asking price ${money(askingPrice)}; storage fee ${money(storageFee)}; estimated regional retail cap ${money(retailCap)}; remaining headroom ${money(headroom)}.`;
    chart.innerHTML = `
      <div class="price-compression-result${overCap ? ' is-over-cap' : ''}">
        <strong>${esc(compressionLabel)}</strong>
        <span>estimated price compression per ${esc(unit)}</span>
      </div>
      <div class="price-compression-track" role="img" aria-label="${esc(ariaLabel)}">
        <span class="price-compression-segment segment-asking" style="width:${askingWidth}%"></span>
        <span class="price-compression-segment segment-storage" style="width:${storageWidth}%"></span>
        <span class="price-compression-segment segment-headroom" style="width:${headroomWidth}%"></span>
        <span class="price-compression-cap-marker${overCap ? ' is-over-cap' : ''}" style="left:${capMarker}%" aria-hidden="true"></span>
      </div>
      <div class="price-compression-legend">
        <span><i class="segment-asking"></i> Seller price <strong>${money(askingPrice)}/${esc(unit)}</strong></span>
        <span><i class="segment-storage"></i> Hub fee <strong>${money(storageFee)}/${esc(unit)}</strong></span>
        <span><i class="segment-headroom"></i> Headroom <strong>${money(headroom)}/${esc(unit)}</strong></span>
        <span><i class="segment-cap"></i> Retail cap <strong>${money(retailCap)}/${esc(unit)}</strong></span>
      </div>
      ${overCap ? `<p class="price-compression-warning">Price plus storage exceeds the illustrative cap by ${money(effectivePrice - retailCap)}.</p>` : ''}
    `;
  }
  async function fetchPriceGuidance({ cropType, askingPrice, unit, storagePointId, signal }) {
    const params = new URLSearchParams({ cropType, askingPrice: String(askingPrice), unit, storagePointId });
    const response = await fetch(`/api/marketplace/price-guidance?${params}`, {
      credentials: 'same-origin',
      signal,
    });
    if (!response.ok) {
      let message = `Guidance unavailable (${response.status})`;
      try { message = (await response.json()).error || message; } catch (_) {}
      throw new Error(message);
    }
    return response.json();
  }
  const status = (selector, message) => {
    const element = $(selector);
    if (element) element.textContent = message || '';
  };
  async function request(path, options = {}) {
    const response = await fetch(`/api/marketplace/${path}`, {
      ...options,
      credentials: 'same-origin',
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    });
    if (!response.ok) {
      let message = `Marketplace request failed (${response.status})`;
      try {
        const body = await response.json();
        message = body.error || message;
      } catch (_) {}
      throw new Error(message);
    }
    if (response.status === 204) return undefined;
    return response.json();
  }

  let stations = [];
  let serverListings = [];
  let stationLoadError = '';
  let activeEditId = null;
  let pricingTimer = null;
  let pricingController = null;
  let customerPricingController = null;
  let customerPricingSignature = '';
  let customerPriceSelectionTouched = false;
  let customerStorageSelectionTouched = false;
  let orderPending = false;
  let cart = [];
  const savedFavourites = new Set();
  const stationSelect = $('#listingLocation');

  const categoryFor = (value, name = '') => {
    const text = `${value || ''} ${name || ''}`.toLowerCase();
    if (/fruit|banana|apple|mango|orange/.test(text)) return 'Fruits';
    if (/grain|rice|paddy|maize|mustard|wheat/.test(text)) return 'Grains';
    if (/herb|ginger|turmeric|herbs/.test(text)) return 'Herbs';
    if (/dairy|milk/.test(text)) return 'Dairy';
    if (/vegetable|tomato|potato|carrot|lettuce|green|cabbage|onion/.test(text)) return 'Vegetables';
    return value || 'Other';
  };
  const productIcon = (name, category) => {
    const text = `${name} ${category}`.toLowerCase();
    if (/tomato/.test(text)) return '🍅';
    if (/potato/.test(text)) return '🥔';
    if (/ginger/.test(text)) return '🫚';
    if (/banana/.test(text)) return '🍌';
    if (/apple/.test(text)) return '🍎';
    if (/rice|paddy|grain|maize/.test(text)) return '🌾';
    if (/milk|dairy/.test(text)) return '🥛';
    if (/carrot/.test(text)) return '🥕';
    return '🥬';
  };

  function getProducts() {
    const samples = typeof customerProductsData !== 'undefined' ? customerProductsData : [];
    const live = serverListings.map((listing) => ({
      id: `server:${listing.id}`,
      productId: String(listing.id),
      name: listing.name,
      description: listing.description || '',
      category: categoryFor(listing.cropType, listing.name),
      cropType: listing.cropType,
      price: Number(listing.price),
      unit: listing.unit,
      farmer: listing.farmerName,
      storagePointId: listing.storagePointId,
      location: listing.originLabel
        || [listing.storagePointDistrict, listing.storagePointState].filter(Boolean).join(', ')
        || listing.storagePointName
        || 'Seller location not listed',
      storagePointName: listing.storagePointName || '',
      sellerCredential: listing.sellerCredential || '',
      stock: `${Number(listing.availableQuantity ?? listing.quantity)} ${listing.unit} available`,
      availableQuantity: Number(listing.availableQuantity ?? listing.quantity),
      img: samples.find((product) => product.name.toLowerCase() === String(listing.cropType).toLowerCase())?.img || '',
      season: 'Farmer listing',
      source: 'server',
      icon: productIcon(listing.name, listing.cropType),
    }));
    return [
      ...samples.map((product) => ({
        ...product,
        productId: `sample-${product.id}`,
        storagePointId: '',
        storagePointName: '',
        description: product.description || '',
        sellerCredential: product.sellerCredential || '',
        source: 'sample',
        availableQuantity: Number.parseFloat(product.stock) || 0,
        icon: productIcon(product.name, product.category),
      })),
      ...live,
    ];
  }
  function customerPriceProducts() {
    return getProducts().filter((product) => priceGuidanceUnits.has(String(product.unit).toLowerCase())
      && Number.isFinite(Number(product.price)) && Number(product.price) > 0);
  }
  function updateCustomerPriceCompression(force = false) {
    const productSelect = $('#customerCompressionProduct');
    const stationSelectForCustomer = $('#customerCompressionStation');
    const products = customerPriceProducts();
    const product = products.find((item) => String(item.id) === productSelect?.value);
    const station = stations.find((item) => String(item.id) === stationSelectForCustomer?.value);
    const note = $('#customerPriceCompressionNote');
    if (!product) {
      renderPriceCompressionChart('#customerPriceCompressionChart', null, 'No kg, quintal, or ton listings are currently available for this comparison.');
      return;
    }
    if (!station) {
      renderPriceCompressionChart('#customerPriceCompressionChart', null, 'A storage hub fee is required before this estimate can be calculated.');
      return;
    }
    const signature = `${product.id}|${product.price}|${product.unit}|${station.id}`;
    if (!force && signature === customerPricingSignature) return;
    customerPricingSignature = signature;
    if (customerPricingController) customerPricingController.abort();
    customerPricingController = new AbortController();
    const controller = customerPricingController;
    if (note) {
      note.textContent = product.source === 'sample'
        ? `Sample seller price; this estimate uses the ${station.name} storage fee as an example, not a delivery quote.`
        : `Seller listing estimate using the ${station.name} storage fee; seller origin: ${product.location}.`;
    }
    renderPriceCompressionChart('#customerPriceCompressionChart', null, 'Calculating price compression estimate…');
    fetchPriceGuidance({
      cropType: product.cropType || product.name,
      askingPrice: Number(product.price),
      unit: String(product.unit).toLowerCase(),
      storagePointId: station.id,
      signal: controller.signal,
    }).then((guidance) => {
      if (controller.signal.aborted) return;
      renderPriceCompressionChart('#customerPriceCompressionChart', guidance);
      if (note) note.textContent += ` ${guidance.sourceLabel}`;
    }).catch((error) => {
      if (error.name === 'AbortError') return;
      renderPriceCompressionChart('#customerPriceCompressionChart', null, `Price estimate unavailable: ${error.message}. No estimate is shown until the service responds.`);
    });
  }
  function renderCustomerPriceControls() {
    const productSelect = $('#customerCompressionProduct');
    const stationSelectForCustomer = $('#customerCompressionStation');
    if (!productSelect || !stationSelectForCustomer) return;
    const products = customerPriceProducts();
    const previousProduct = productSelect.value;
    productSelect.innerHTML = products.length
      ? products.map((product) => `<option value="${esc(product.id)}">${esc(product.name)} · ${money(product.price)}/${esc(product.unit)}</option>`).join('')
      : '<option value="">No compatible listings</option>';
    productSelect.disabled = products.length === 0;
    if (!products.length) {
      customerPricingSignature = '';
      renderPriceCompressionChart('#customerPriceCompressionChart', null, 'No kg, quintal, or ton listings are currently available for this comparison.');
      return;
    }
    const selectedProduct = customerPriceSelectionTouched
      ? products.find((product) => String(product.id) === previousProduct) || products.find((product) => product.source === 'server') || products[0]
      : products.find((product) => product.source === 'server') || products.find((product) => String(product.id) === previousProduct) || products[0];
    productSelect.value = String(selectedProduct.id);
    const previousStation = stationSelectForCustomer.value;
    stationSelectForCustomer.innerHTML = stations.length
      ? stations.map((station) => `<option value="${esc(station.id)}">${esc(station.name)} · ${esc(station.district)}, ${esc(station.state)}</option>`).join('')
      : '<option value="">No available storage hubs</option>';
    stationSelectForCustomer.disabled = stations.length === 0;
    if (!stations.length) {
      customerPricingSignature = '';
      renderPriceCompressionChart('#customerPriceCompressionChart', null, 'No storage hub fees are available for this estimate.');
      return;
    }
    const preferredStation = !customerStorageSelectionTouched && selectedProduct.storagePointId
      && stations.some((station) => String(station.id) === String(selectedProduct.storagePointId))
      ? selectedProduct.storagePointId
      : stations.some((station) => String(station.id) === previousStation)
        ? previousStation
        : stations[0].id;
    stationSelectForCustomer.value = String(preferredStation);
    updateCustomerPriceCompression();
  }
  function productById(id) {
    return getProducts().find((product) => String(product.id) === String(id));
  }
  function cartTotal() {
    return cart.reduce((total, item) => {
      const product = productById(item.id);
      return total + (product ? product.price * item.qty : 0);
    }, 0);
  }
  function syncCartCount() {
    const count = $('#cartCount');
    if (count) count.textContent = String(cart.reduce((sum, item) => sum + item.qty, 0));
  }
  function updateFarmerStats() {
    const count = $('#farmerListingCount');
    const storageHubs = $('#farmerStationCount');
    if (count) count.textContent = String(serverListings.length);
    if (storageHubs) {
      storageHubs.textContent = String(new Set(serverListings.map((listing) => listing.storagePointId)).size);
    }
  }
  function renderFarmerListings() {
    updateFarmerStats();
    const grid = $('#farmerListingsGrid');
    if (!grid) return;
    if (!serverListings.length) {
      grid.innerHTML = '<div class="panel" style="grid-column:1/-1;text-align:center;padding:24px"><div style="font-size:32px">🌾</div><strong>No crop batches yet</strong><p class="subtle">Create your first supplier batch above and assign it to a logistic storage point.</p></div>';
      return;
    }
    grid.innerHTML = serverListings.map((listing) => {
      const category = categoryFor(listing.cropType, listing.name);
      const origin = listing.originLabel || listing.storagePointName || 'Location not listed';
      const credential = listing.sellerCredential
        ? `Seller-provided: ${esc(listing.sellerCredential)} · not verified`
        : 'No seller credential provided';
      return `<article class="farmer-listing-card"><div class="listing-art" aria-hidden="true">${productIcon(listing.name, category)}</div><div class="listing-body">
        <span class="farmer-listing-status">Shared listing</span><h4>${esc(listing.name)}</h4>
        <p>${esc(category)} · ${esc(origin)} · Storage hub: ${esc(listing.storagePointName || 'Not assigned')}</p>
        <p class="farmer-listing-description">${esc(listing.description || 'No product description provided.')}</p>
        <div class="customer-price farmer-listing-price">${money(listing.price)}<small style="font-size:11px;color:var(--muted)">/${esc(listing.unit)}</small></div>
        <p class="farmer-listing-stock">${Number(listing.availableQuantity ?? listing.quantity)} ${esc(listing.unit)} available</p>
        <p class="farmer-listing-credential">${credential}</p>
        <div class="listing-actions"><button type="button" data-listing-edit="${esc(listing.id)}">Edit</button><button type="button" data-listing-remove="${esc(listing.id)}">Remove</button></div>
      </div></article>`;
    }).join('');
  }
  function renderCustomerProducts() {
    const grid = $('#customerProducts');
    if (!grid) return;
    const query = ($('#customerProductSearch')?.value || '').trim().toLowerCase();
    const locationQuery = ($('#customerLocation')?.value || '').trim().toLowerCase();
    const selectedCategory = document.querySelector('#customerMarketTabs button.active')?.dataset.customerKind || 'All';
    const products = getProducts().filter((product) => {
      const searchable = `${product.name} ${product.category} ${product.farmer} ${product.location}`.toLowerCase();
      const locationMatches = !locationQuery || locationQuery === 'assam, india'
        || searchable.includes(locationQuery) || locationQuery.split(',')[0].trim() === 'assam';
      return (selectedCategory === 'All' || product.category === selectedCategory)
        && searchable.includes(query) && locationMatches;
    });
    const sampleCount = products.filter((product) => product.source === 'sample').length;
    const liveCount = products.length - sampleCount;
    const results = $('#customerResultsText');
    if (results) results.textContent = `${products.length} listings · ${liveCount} shared farmer ${liveCount === 1 ? 'listing' : 'listings'} · ${sampleCount} sample`;
    grid.innerHTML = products.map((product) => {
      const photo = product.img
        ? `<img src="${esc(product.img)}" alt="${esc(product.name)}" loading="lazy">`
        : `<span style="font-size:54px;display:grid;place-items:center;height:100%">${product.icon}</span>`;
      const stock = product.availableQuantity;
      const credential = product.sellerCredential
        ? `Seller-provided: ${esc(product.sellerCredential)}`
        : 'No seller credential provided';
      const imageLabel = product.img ? '' : `<span class="product-art-label">${esc(product.category)}</span>`;
      return `<article class="customer-product" data-testid="card-product-${esc(product.id)}">
        <div class="customer-product-photo">${photo}${imageLabel}<button type="button" class="heart" data-fav="${esc(product.id)}" aria-label="Save ${esc(product.name)}" data-testid="button-favorite-${esc(product.id)}">${savedFavourites.has(String(product.id)) ? '♥' : '♡'}</button></div>
        <div class="customer-product-body">
          <div class="product-card-heading"><span class="pill">${esc(product.category)}</span>${product.source === 'sample' ? '<span class="product-sample-tag">Sample</span>' : ''}</div>
          <h4>${esc(product.name)}</h4>
          <p class="product-description">${esc(product.description || 'No additional description provided by the seller.')}</p>
          <div class="product-farmer-row"><span class="seller-mark" aria-hidden="true">VK</span><div><strong>${esc(product.farmer || 'Farmer details not provided')}</strong><small>Seller profile · ${product.source === 'sample' ? 'demo listing' : 'marketplace listing'}</small></div></div>
          <p class="product-location"><span aria-hidden="true">⌖</span><span>${esc(product.location)}${product.source === 'server' && product.storagePointName && product.location !== product.storagePointName ? `<small>Storage hub: ${esc(product.storagePointName)}</small>` : ''}</span></p>
          <div class="product-trust-badge"><span aria-hidden="true">▣</span><span>${credential}<small>Not independently verified</small></span></div>
          <div class="product-stock-row"><span>Available batch</span><strong>${Number(stock).toLocaleString('en-IN')} ${esc(product.unit)}</strong></div>
          <div class="customer-product-bottom"><span class="customer-price">${money(product.price)}<small>/${esc(product.unit)}</small></span></div>
          <div class="product-card-actions">
            <button type="button" class="add-cart" data-add-cart="${esc(product.id)}" data-testid="button-add-cart-${esc(product.id)}" ${stock <= 0 ? 'disabled' : ''}>Add to cart</button>
            <button type="button" class="buy-now" data-buy-now="${esc(product.id)}" data-testid="button-buy-now-${esc(product.id)}" ${stock <= 0 ? 'disabled' : ''}>Buy now</button>
          </div>
          <button type="button" class="product-detail-btn" data-product-detail="${esc(product.id)}">View details ↗</button>
        </div>
      </article>`;
    }).join('') || '<p class="subtle">No matching produce found. Try another search or category.</p>';
    syncCartCount();
    renderCustomerPriceControls();
  }

  async function loadStations() {
    try {
      stations = await request('storage-points');
      stationLoadError = '';
      if (!stationSelect) return;
      const previous = stationSelect.value;
      stationSelect.innerHTML = '<option value="">Select a logistic storage point</option>'
        + stations.map((station) => `<option value="${esc(station.id)}">${esc(station.name)} · ${esc(station.district)}, ${esc(station.state)} · ₹${Number(station.feePerQuintal).toLocaleString('en-IN')}/quintal storage fee</option>`).join('');
      if (stations.some((station) => station.id === previous)) stationSelect.value = previous;
      stationSelect.disabled = stations.length === 0;
      if (!stations.length) {
        stationSelect.innerHTML = '<option value="">No available storage stations</option>';
        stationLoadError = 'No logistic storage points are currently available. A point is required for every batch.';
        status('#farmerMarketplaceStatus', stationLoadError);
      }
      renderCustomerPriceControls();
    } catch (error) {
      stationLoadError = `Could not load storage stations: ${error.message}. Retry by refreshing the page.`;
      if (stationSelect) {
        stationSelect.innerHTML = '<option value="">Could not load storage points</option>';
        stationSelect.disabled = true;
      }
      status('#farmerMarketplaceStatus', stationLoadError);
      renderCustomerPriceControls();
    }
  }
  async function loadListings() {
      status('#farmerMarketplaceStatus', 'Loading supplier inventory…');
      status('#customerMarketplaceStatus', 'Loading shared farmer listings…');
    try {
      serverListings = await request('listings');
      status('#farmerMarketplaceStatus', stationLoadError);
      status('#customerMarketplaceStatus', '');
      renderFarmerListings();
      renderCustomerProducts();
      return true;
    } catch (error) {
      status('#farmerMarketplaceStatus', `Could not load marketplace listings: ${error.message}. Retry by refreshing the page.`);
      status('#customerMarketplaceStatus', `Shared farmer listings could not be loaded: ${error.message}. Sample catalog remains available.`);
      renderFarmerListings();
      renderCustomerProducts();
      return false;
    }
  }
  function selectedStationName(id) {
    return stations.find((station) => String(station.id) === String(id))?.name || '';
  }
  function farmerName() {
    try {
      const profile = JSON.parse(localStorage.getItem('vk_profile') || '{}');
      return String(profile.farmerName || '').trim() || 'Demo farmer';
    } catch (_) {
      return 'Demo farmer';
    }
  }
  function updateOriginFields() {
    const originType = $('#listingOriginType')?.value || 'farm';
    const field = $('#listingOriginLabelField');
    const input = $('#listingOriginLabel');
    const label = $('#listingOriginLabelText');
    if (!field || !input || !label) return;
    const isStorageHub = originType === 'storage_hub';
    field.hidden = isStorageHub;
    input.required = !isStorageHub;
    if (originType === 'mandi') {
      label.textContent = 'Local mandi name and location';
      input.placeholder = 'Mandi, district, state';
    } else {
      label.textContent = 'Farm location';
      input.placeholder = 'Village, district, state';
    }
  }
  function listingPayload() {
    const originType = $('#listingOriginType').value;
    return {
      name: $('#listingName').value.trim(),
      cropType: $('#listingCategory').value,
      description: $('#listingDescription').value.trim(),
      price: Number($('#listingPrice').value),
      unit: $('#listingUnit').value,
      quantity: Number($('#listingStock').value),
      storagePointId: stationSelect.value,
      farmerName: farmerName(),
      originType,
      originLabel: originType === 'storage_hub' ? '' : $('#listingOriginLabel').value.trim(),
      sellerCredential: $('#listingSellerCredential').value.trim(),
    };
  }
  function setFormBusy(busy) {
    const submit = $('#listingSubmit');
    if (submit) {
      submit.disabled = busy;
      submit.textContent = busy ? 'Saving…' : activeEditId ? 'Save changes' : '＋ Add listing';
    }
  }
  function resetListingForm() {
    $('#farmerListingForm')?.reset();
    activeEditId = null;
    setFormBusy(false);
    updateOriginFields();
    schedulePricing();
  }
  async function saveListing(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const payload = listingPayload();
    if (!payload.name || !payload.description || !payload.cropType || !payload.storagePointId
      || (payload.originType !== 'storage_hub' && !payload.originLabel)
      || !Number.isFinite(payload.price) || payload.price <= 0
      || !Number.isFinite(payload.quantity) || payload.quantity <= 0) {
      status('#farmerMarketplaceStatus', 'Enter a product title and description, a valid price and stock, a selling origin, and a logistic storage hub.');
      return;
    }
    const wasEditing = Boolean(activeEditId);
    setFormBusy(true);
    status('#farmerMarketplaceStatus', activeEditId ? 'Updating listing…' : 'Creating listing…');
    try {
      const saved = activeEditId
        ? await request(`listings/${encodeURIComponent(activeEditId)}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await request('listings', { method: 'POST', body: JSON.stringify(payload) });
      serverListings = wasEditing
        ? serverListings.map((listing) => String(listing.id) === String(saved.id) ? saved : listing)
        : [saved, ...serverListings];
      renderFarmerListings();
      renderCustomerProducts();
      resetListingForm();
      const refreshed = await loadListings();
      if (refreshed) status('#farmerMarketplaceStatus', wasEditing ? 'Listing updated.' : 'Listing saved and shared with the marketplace.');
      activeEditId = null;
      toast('Listing saved');
    } catch (error) {
      setFormBusy(false);
      status('#farmerMarketplaceStatus', `Could not save listing: ${error.message}`);
    }
  }
  async function removeListing(id) {
    const listing = serverListings.find((item) => String(item.id) === String(id));
    if (!listing) return;
    if (!confirm(`Remove “${listing.name}” from shared farmer listings?`)) return;
    status('#farmerMarketplaceStatus', 'Removing listing…');
    try {
      await request(`listings/${encodeURIComponent(listing.id)}`, { method: 'DELETE' });
      if (String(activeEditId) === String(listing.id)) resetListingForm();
      serverListings = serverListings.filter((item) => String(item.id) !== String(listing.id));
      renderFarmerListings();
      renderCustomerProducts();
      const refreshed = await loadListings();
      if (refreshed) status('#farmerMarketplaceStatus', 'Listing removed from the marketplace.');
      toast('Listing removed');
    } catch (error) {
      status('#farmerMarketplaceStatus', `Could not remove listing: ${error.message}`);
    }
  }
  function editListing(id) {
    const listing = serverListings.find((item) => String(item.id) === String(id));
    if (!listing) return;
    activeEditId = listing.id;
    $('#listingName').value = listing.name;
    $('#listingCategory').value = listing.cropType;
    $('#listingDescription').value = listing.description || '';
    $('#listingPrice').value = listing.price;
    $('#listingUnit').value = listing.unit;
    $('#listingStock').value = listing.availableQuantity ?? listing.quantity;
    stationSelect.value = listing.storagePointId;
    $('#listingOriginType').value = listing.originType || 'storage_hub';
    $('#listingOriginLabel').value = listing.originLabel || '';
    $('#listingSellerCredential').value = listing.sellerCredential || '';
    updateOriginFields();
    $('#listingEmoji').value = productIcon(listing.name, listing.cropType);
    setFormBusy(false);
    schedulePricing();
    $('#listingName').focus();
    $('#farmerListingForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function addToCart(product) {
    if (document.body.classList.contains('role-farmer') || !product || product.availableQuantity <= 0) return false;
    const item = cart.find((entry) => String(entry.id) === String(product.id));
    if (item) {
      if (item.qty >= product.availableQuantity) {
        toast('That is the available quantity for this listing');
        return false;
      }
      item.qty += 1;
    } else {
      cart.push({ id: product.id, qty: 1 });
    }
    renderCustomerProducts();
    toast('Added to your demo cart');
    return true;
  }
  function renderCart() {
    if (document.body.classList.contains('role-farmer')) return;
    cart = cart.filter((item) => productById(item.id));
    const rows = cart.map((item) => {
      const product = productById(item.id);
      return `<div class="cart-line" data-testid="row-cart-${esc(product.id)}">
        <div class="cart-line-art" aria-hidden="true">${product.icon}</div>
        <div class="cart-line-info"><strong>${esc(product.name)}</strong><small>${money(product.price)} / ${esc(product.unit)} · ${esc(product.location)}</small><b>${money(product.price * item.qty)}</b></div>
        <div class="cart-quantity" aria-label="Quantity controls for ${esc(product.name)}"><button type="button" data-cart-minus="${esc(product.id)}" aria-label="Remove one ${esc(product.name)}" data-testid="button-cart-minus-${esc(product.id)}">−</button><span aria-live="polite">${item.qty}</span><button type="button" data-cart-plus="${esc(product.id)}" aria-label="Add one ${esc(product.name)}" data-testid="button-cart-plus-${esc(product.id)}" ${item.qty >= product.availableQuantity ? 'disabled' : ''}>＋</button></div>
      </div>`;
    }).join('');
    const total = cartTotal();
    modal('Your shopping cart', `<div class="cart-items">${rows || '<p class="cart-empty">Your cart is empty. Add fresh produce to get started.</p>'}</div>
      <div class="cart-subtotal"><span>Subtotal</span><strong>${money(total)}</strong></div>
      <p class="checkout-demo-note">Demo checkout only. No payment will be collected.</p>
      ${cart.length ? '<button type="button" class="btn green cart-checkout-button" id="continueToCheckout" data-testid="button-continue-checkout">Continue to checkout</button>' : ''}`);
  }
  function renderCheckout() {
    if (document.body.classList.contains('role-farmer')) return;
    cart = cart.filter((item) => productById(item.id));
    if (!cart.length) {
      renderCart();
      return;
    }
    const rows = cart.map((item) => {
      const product = productById(item.id);
      return `<div class="checkout-summary-line"><span>${esc(product.name)} <small>× ${item.qty} ${esc(product.unit)}</small></span><strong>${money(product.price * item.qty)}</strong></div>`;
    }).join('');
    modal('Checkout · demo only', `<form id="demoCheckoutForm" class="demo-checkout-form">
      <div class="checkout-summary"><h4>Order summary</h4>${rows}<div class="cart-subtotal"><span>Subtotal</span><strong>${money(cartTotal())}</strong></div></div>
      <div class="field checkout-address-field"><label for="deliveryAddress">Delivery address</label><textarea id="deliveryAddress" name="deliveryAddress" required maxlength="500" autocomplete="street-address" placeholder="House / street, village or town, district, state, PIN code"></textarea><small>This address is used only for this demo checkout and is not saved.</small></div>
      <fieldset class="payment-options"><legend>Choose a simulated payment method</legend>
        <label class="payment-option"><input type="radio" name="paymentMethod" value="UPI" checked><span><strong>UPI</strong><small>Demo simulation · no UPI ID requested</small></span></label>
        <label class="payment-option"><input type="radio" name="paymentMethod" value="Card"><span><strong>Card</strong><small>Demo simulation · no card details requested</small></span></label>
        <label class="payment-option"><input type="radio" name="paymentMethod" value="Net Banking"><span><strong>Net banking</strong><small>Demo simulation · no bank login requested</small></span></label>
      </fieldset>
      <p class="checkout-demo-note" role="note">This prototype does not process payments or arrange delivery. Do not enter payment credentials.</p>
      <div class="checkout-actions"><button type="button" class="btn ghost" id="backToCart">Back to cart</button><button type="submit" class="btn green" id="demoCheckout" data-testid="button-place-demo-order">Place demo order</button></div>
    </form>`);
  }
  async function checkout(event) {
    event?.preventDefault();
    event?.stopImmediatePropagation();
    if (document.body.classList.contains('role-farmer') || orderPending || !cart.length) return;
    const form = $('#demoCheckoutForm');
    if (!form?.reportValidity()) return;
    const paymentMethod = new FormData(form).get('paymentMethod') || 'UPI';
    const items = cart.map((item) => {
      const product = productById(item.id);
      return product && {
        productId: product.productId,
        name: product.name,
        quantity: item.qty,
        unitPrice: product.price,
        unit: product.unit,
        storagePointName: product.source === 'sample'
          ? `Sample origin: ${product.location}`
          : product.storagePointName,
      };
    }).filter(Boolean);
    if (!items.length) {
      status('#customerMarketplaceStatus', 'Your cart no longer contains available products. Refresh and try again.');
      closeModal();
      return;
    }
    const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    orderPending = true;
    const checkoutButton = $('#demoCheckout');
    if (checkoutButton) {
      checkoutButton.disabled = true;
      checkoutButton.textContent = 'Submitting…';
    }
    try {
      const receipt = await request('orders', { method: 'POST', body: JSON.stringify({ items, totalAmount }) });
      cart = [];
      renderCustomerProducts();
      modal('Demo order received', `<div class="notice"><strong>Demo receipt only.</strong> No payment was processed.</div><p><strong>Receipt:</strong> ${esc(receipt.id)}</p><p><strong>Status:</strong> ${esc(receipt.status)}</p><p><strong>Items:</strong> ${Number(receipt.itemCount)}</p><p><strong>Total:</strong> ${money(receipt.totalAmount)}</p><p><strong>Simulated method:</strong> ${esc(paymentMethod)}</p><p class="subtle">Recorded ${esc(new Date(receipt.createdAt).toLocaleString())}. This demo order does not charge you or confirm delivery.</p><button type="button" class="btn green" id="receiptDone">Done</button>`);
      $('#receiptDone')?.addEventListener('click', closeModal);
    } catch (error) {
      const current = $('#modalBody');
      if (current) {
        const errorMessage = document.createElement('p');
        errorMessage.className = 'notice';
        errorMessage.setAttribute('role', 'alert');
        errorMessage.textContent = `Order could not be submitted: ${error.message}. Your cart is unchanged.`;
        current.prepend(errorMessage);
      }
    } finally {
      orderPending = false;
      const retryButton = $('#demoCheckout');
      if (retryButton) {
        retryButton.disabled = false;
        retryButton.textContent = 'Place demo order';
      }
    }
  }

  async function loadPriceGuidance() {
    const output = $('#marketSmartPricing');
    if (!output) return;
    const cropType = $('#listingCategory')?.value || '';
    const askingPrice = Number($('#listingPrice')?.value);
    const unit = $('#listingUnit')?.value || '';
    if (!cropType || !Number.isFinite(askingPrice) || askingPrice <= 0 || !unit) {
      output.textContent = 'Select a crop, base price, unit, and logistic storage point to calculate price compression efficiency.';
      output.setAttribute('role', 'status');
      renderPriceCompressionChart('#farmerPriceCompressionChart', null, 'Enter a valid asking price to calculate the chart.');
      return;
    }
    const storagePointId = stationSelect?.value || '';
    if (!storagePointId) {
      output.textContent = 'Select a logistic storage point to include its storage node fee in the calculation.';
      output.setAttribute('role', 'status');
      renderPriceCompressionChart('#farmerPriceCompressionChart', null, 'Select a storage hub to calculate the chart.');
      return;
    }
    if (pricingController) pricingController.abort();
    pricingController = new AbortController();
    const controller = pricingController;
    output.textContent = 'Calculating compression efficiency with the selected storage node fee…';
    output.setAttribute('role', 'status');
    renderPriceCompressionChart('#farmerPriceCompressionChart', null, 'Calculating price compression estimate…');
    try {
      const guidance = await fetchPriceGuidance({ cropType, askingPrice, unit, storagePointId, signal: controller.signal });
      if (controller.signal.aborted) return;
      output.textContent = `${guidance.comparison} Formula: (1 − (${money(guidance.askingPrice)} base + ${money(guidance.storageNodeFee)} storage fee) ÷ ${money(guidance.regionalRetailCap)} simulated market cap) × 100. ${guidance.sourceLabel}`;
      renderPriceCompressionChart('#farmerPriceCompressionChart', guidance);
    } catch (error) {
      if (error.name !== 'AbortError') {
        output.textContent = `Price guidance unavailable: ${error.message}. No estimate is shown until the service responds.`;
        output.setAttribute('role', 'alert');
        renderPriceCompressionChart('#farmerPriceCompressionChart', null, `Price estimate unavailable: ${error.message}. No chart is shown until the service responds.`);
      }
    }
  }
  function schedulePricing() {
    clearTimeout(pricingTimer);
    pricingTimer = setTimeout(loadPriceGuidance, 250);
  }

  document.addEventListener('submit', (event) => {
    if (event.target?.id === 'farmerListingForm') saveListing(event);
  }, true);
  document.addEventListener('click', (event) => {
    const target = event.target;
    const edit = target.closest?.('[data-listing-edit]');
    const remove = target.closest?.('[data-listing-remove]');
    if (edit || remove) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (edit) editListing(edit.dataset.listingEdit);
      else removeListing(remove.dataset.listingRemove);
      return;
    }
    const productGrid = target.closest?.('#customerProducts');
    if (productGrid) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const favourite = target.closest('[data-fav]');
      if (favourite) {
        const id = String(favourite.dataset.fav);
        savedFavourites.has(id) ? savedFavourites.delete(id) : savedFavourites.add(id);
        renderCustomerProducts();
        return;
      }
      const addButton = target.closest('[data-add-cart]');
      if (addButton) {
        addToCart(productById(addButton.dataset.addCart));
        return;
      }
      const buyNowButton = target.closest('[data-buy-now]');
      if (buyNowButton) {
        if (addToCart(productById(buyNowButton.dataset.buyNow))) renderCheckout();
        return;
      }
      const details = target.closest('[data-product-detail]');
      if (details) {
        const product = productById(details.dataset.productDetail);
        if (!product) return;
        const image = product.img
          ? `<img src="${esc(product.img)}" alt="${esc(product.name)}" style="width:100%;max-height:230px;object-fit:cover;border-radius:14px">`
          : `<div style="height:150px;display:grid;place-items:center;background:#17281b;border-radius:14px;font-size:66px">${product.icon}</div>`;
        const credential = product.sellerCredential
          ? `Seller-provided: ${esc(product.sellerCredential)}`
          : 'No seller credential provided';
        modal(product.name, `<div class="product-detail-content">${image}
          <p class="product-detail-price"><strong>${money(product.price)}/${esc(product.unit)}</strong><span>${Number(product.availableQuantity).toLocaleString('en-IN')} ${esc(product.unit)} available</span></p>
          <p>${esc(product.description || 'No additional description provided by the seller.')}</p>
          <div class="product-farmer-row"><span class="seller-mark" aria-hidden="true">VK</span><div><strong>${esc(product.farmer || 'Farmer details not provided')}</strong><small>${esc(product.location)}</small></div></div>
          <div class="product-trust-badge"><span aria-hidden="true">▣</span><span>${credential}<small>Not independently verified</small></span></div>
          <p class="checkout-demo-note">${product.source === 'sample' ? 'Sample marketplace listing. ' : ''}Confirm quality, availability, and delivery arrangements with the seller.</p>
          <div class="product-card-actions"><button type="button" class="add-cart" id="detailAddCart">Add to cart</button><button type="button" class="buy-now" id="detailBuyNow">Buy now</button></div>
        </div>`);
        $('#detailAddCart')?.addEventListener('click', () => {
          addToCart(product);
          closeModal();
        });
        $('#detailBuyNow')?.addEventListener('click', () => {
          if (addToCart(product)) renderCheckout();
        });
      }
      return;
    }
    if (target.closest?.('#viewCartBtn')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      renderCart();
      return;
    }
    if (target.closest?.('#continueToCheckout')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      renderCheckout();
      return;
    }
    if (target.closest?.('#backToCart')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      renderCart();
      return;
    }
    const plus = target.closest?.('[data-cart-plus]');
    const minus = target.closest?.('[data-cart-minus]');
    if (plus || minus) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const id = String((plus || minus).dataset.cartPlus || (plus || minus).dataset.cartMinus);
      const item = cart.find((entry) => String(entry.id) === id);
      const product = productById(id);
      if (item && product) {
        if (plus && item.qty < product.availableQuantity) item.qty += 1;
        if (minus) item.qty -= 1;
        cart = cart.filter((entry) => entry.qty > 0);
        renderCart();
        renderCustomerProducts();
      }
      return;
    }
  }, true);
  document.addEventListener('submit', (event) => {
    if (event.target?.id === 'demoCheckoutForm') checkout(event);
  }, true);
  $('#listingCategory')?.addEventListener('change', schedulePricing);
  $('#listingPrice')?.addEventListener('input', schedulePricing);
  $('#listingUnit')?.addEventListener('change', schedulePricing);
  $('#listingLocation')?.addEventListener('change', schedulePricing);
  $('#listingOriginType')?.addEventListener('change', updateOriginFields);
  $('#customerCompressionProduct')?.addEventListener('change', () => {
    customerPriceSelectionTouched = true;
    const product = customerPriceProducts().find((item) => String(item.id) === $('#customerCompressionProduct').value);
    if (!customerStorageSelectionTouched && product?.storagePointId && stations.some((station) => String(station.id) === String(product.storagePointId))) {
      $('#customerCompressionStation').value = String(product.storagePointId);
    }
    updateCustomerPriceCompression(true);
  });
  $('#customerCompressionStation')?.addEventListener('change', () => {
    customerStorageSelectionTouched = true;
    updateCustomerPriceCompression(true);
  });
  $('#customerProductSearch')?.addEventListener('input', renderCustomerProducts);
  $('#customerLocation')?.addEventListener('input', renderCustomerProducts);
  $('#customerMarketTabs')?.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
    setTimeout(renderCustomerProducts, 0);
  }));
  window.addEventListener('focus', () => { loadStations().then(loadListings); });

  updateOriginFields();
  renderFarmerListings();
  renderCustomerProducts();
  loadStations().then(loadListings);
})();
