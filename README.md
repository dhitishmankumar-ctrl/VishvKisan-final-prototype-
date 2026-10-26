#  VishvKisan — From Fields to Families

**A Digital Bridge for Indian Agriculture**

VishvKisan is a web-based agricultural marketplace prototype designed to connect farmers directly with customers. It brings together produce discovery, farming guidance, market information, pesticide-safety awareness and farmer support in one platform.

**Live Prototype:** https://vishv-kisan-showcase--dhritishmankuma.replit.app/

##  Problem Statement

Farmers can face limited market access, dependence on intermediaries, uncertain selling prices and difficulty accessing useful agricultural information,not knowing govt schemes. 
Consumers may also struggle to discover local produce and understand farming practices,fair pirce,less useable pestcides crop products, trust etc.

VishvKisan aims to bridge these gaps through digital market access, agricultural guidance and greater transparency.

##  Key Features

###  Farmer Workspace
- Farm profile and personalised field information
- Crop listings and supplier inventory
- Farmer profit calculator
- Mandi price comparison tools
- Weather and field-planning guidance

###  Customer Marketplace
- Browse sample produce listings
- Search and filter products by category
- Explore local produce and displayed prices
- Demonstration cart and order workflows

###  Smart Farming Tools
- General crop guidance
- Demonstration crop-health photo workflow
- Simulated crop recommendations
- Soil, season and water-related planning guidance
- Illustrative field dashboard

###  Weather and Field Readiness
- Location-based forecast lookup when the external service is available
- Five-day forecast interface
- General weather-aware farming and flood-readiness reminders

###  Pesticide Safety and Public Health
- WHO/FAO-aligned pesticide-safety awareness
- Guidance on product labels, protective equipment and harvest intervals
- Consumer awareness of traceability and pesticide residues
- Clear notice that produce is not laboratory-tested or certified by this prototype

###  Farmer Support
- Government scheme information with official resource links
- Licence-details record and printable farmer e-card
- Farmer community demonstration
- Bulk-buying requests and demo order tracking
- English, Assamese and Hindi language options in the showcase

##  Technology Stack

- HTML
- TypeScript
- JavaScript
- CSS
- pnpm workspace for package management

The repository also contains application and shared-library folders. Refer to the project configuration for the exact application architecture and commands.

## 🚀 Getting Started

### Prerequisites
- Git
- Node.js compatible with the project dependencies
- pnpm

### Installation

Clone the repository:

```bash
git clone https://github.com/dhitishmankumar-ctrl/VishvKisan-final-prototype-.git
cd VishvKisan-final-prototype-
```

Install dependencies:

```bash
pnpm install
```

Run the available type checks and build:

```bash
pnpm run typecheck
pnpm run build
```

To start the development server, inspect the relevant application's `package.json` and Replit workflow configuration for its supported development command.

##  Prototype Status and Limitations

VishvKisan is an early-stage prototype. Some features are simulations intended to demonstrate the proposed user experience.

- Market prices and product listings may use illustrative sample data.
- Crop-photo assessment and crop recommendations are demonstrations, not validated AI diagnoses.
- Weather lookup depends on external service availability; sample dashboard readings are not live sensor data.
- Farm profiles, community posts, licence records and some orders are stored locally in the browser.
- Farmer licence details are not independently verified.
- The prototype does not test or certify pesticide residues in produce.
- Real payments, delivery services and production-grade authentication are not connected unless separately implemented.

Users should verify agricultural decisions and current market information with appropriate official sources and local agricultural experts.

##  Proposed Key Performance Indicators

Future pilot evaluation could measure:
- Number of farmers registered
- Number of active customers
- Produce listings and completed orders
- Farmer income and market access
- User engagement with farming guidance
- Awareness of responsible pesticide use and food safety

These are proposed indicators, not measured results.

##  Future Development

- Secure authentication and protected user accounts
- Persistent database and verified farmer records
- Reliable live market-price integration
- Expanded weather and agricultural data integrations
- Validated AI-assisted crop advisory
- Real order management, payments and delivery tracking
- Testing, accessibility and regional-language improvements

## 🌍 Vision

VishvKisan aims to create a more connected, transparent and sustainable agricultural ecosystem—helping farmers reach customers and helping families make informed food choices.

**Tagline:** From Fields to Families · खेतों से हर परिवार तक
