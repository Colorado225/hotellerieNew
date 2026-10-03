-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PropertyStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "HotelClassification" AS ENUM ('NO_STAR', 'ONE_STAR', 'TWO_STAR', 'THREE_STAR_PLUS');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');

-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('SUPER_ADMIN', 'OWNER', 'GENERAL_MANAGER', 'FRONT_DESK_MANAGER', 'RECEPTIONIST', 'CASHIER', 'HOUSEKEEPING_SUPERVISOR', 'HOUSEKEEPER', 'MAINTENANCE', 'ACCOUNTANT', 'AUDITOR');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'OCCUPIED', 'BLOCKED', 'OUT_OF_ORDER', 'OUT_OF_SERVICE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "HousekeepingStatus" AS ENUM ('CLEAN', 'DIRTY', 'CLEANING', 'INSPECTED');

-- CreateEnum
CREATE TYPE "FrontOfficeStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('NONE', 'PENDING', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('DRAFT', 'OPTION', 'CONFIRMED', 'WAITLISTED', 'CANCELLED', 'NO_SHOW', 'CHECKED_IN', 'CHECKED_OUT', 'CLOSED');

-- CreateEnum
CREATE TYPE "ReservationSource" AS ENUM ('DIRECT', 'PHONE', 'WHATSAPP', 'WALK_IN', 'WEBSITE', 'OTA', 'AGENCY', 'CORPORATE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReservationRoomStatus" AS ENUM ('RESERVED', 'OCCUPIED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "GuestRole" AS ENUM ('PRIMARY', 'ADULT', 'CHILD', 'COMPANION');

-- CreateEnum
CREATE TYPE "VipLevel" AS ENUM ('NONE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND');

-- CreateEnum
CREATE TYPE "StayStatus" AS ENUM ('EXPECTED', 'CHECKED_IN', 'IN_HOUSE', 'CHECKED_OUT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FolioStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'CLOSED');

-- CreateEnum
CREATE TYPE "FolioItemType" AS ENUM ('ROOM', 'BREAKFAST', 'RESTAURANT', 'BAR', 'LAUNDRY', 'ROOM_SERVICE', 'SPA', 'OTHER_SERVICE', 'DISCOUNT', 'TAX', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_MONEY', 'OTHER');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'APPROVED', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'FINALIZED', 'SUBMITTED', 'CERTIFIED', 'REJECTED', 'CANCELLED', 'CREDITED');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('NORMAL', 'DEBIT_NOTE', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "FneSubmissionStatus" AS ENUM ('PENDING', 'PROCESSING', 'CERTIFIED', 'REJECTED', 'RETRYING', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSING', 'CLOSED');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('SALE', 'PAYMENT', 'REFUND', 'CASH_IN', 'CASH_OUT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "HousekeepingTaskType" AS ENUM ('CHECKOUT_CLEAN', 'STAYOVER', 'DEEP_CLEAN', 'INSPECTION', 'VIP_PREP', 'MAINTENANCE_FOLLOWUP');

-- CreateEnum
CREATE TYPE "HousekeepingTaskStatus" AS ENUM ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'INSPECTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "MaintenanceTicketStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_PART', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('IN_SERVICE', 'OUT_OF_SERVICE', 'SCRAPPED');

-- CreateEnum
CREATE TYPE "NightAuditStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NightTaxJurisdiction" AS ENUM ('NATIONAL', 'REGIONAL', 'MUNICIPAL');

-- CreateEnum
CREATE TYPE "TaxObligationStatus" AS ENUM ('PENDING', 'DECLARED', 'SUBMITTED', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "TaxCalculationMethod" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'PER_NIGHT', 'PER_PERSON_PER_NIGHT');

-- CreateEnum
CREATE TYPE "MealPlan" AS ENUM ('ROOM_ONLY', 'BREAKFAST_INCLUDED', 'HALF_BOARD', 'FULL_BOARD', 'ALL_INCLUSIVE');

-- CreateEnum
CREATE TYPE "CancellationPenaltyType" AS ENUM ('NONE', 'FIXED_AMOUNT', 'FIRST_NIGHT', 'PERCENTAGE', 'FULL_STAY');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'WHATSAPP', 'SMS');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "slug" TEXT NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "default_currency" CHAR(3) NOT NULL DEFAULT 'XOF',
    "country_code" CHAR(2) NOT NULL DEFAULT 'CI',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legal_name" TEXT,
    "rccm" TEXT,
    "tax_identifier" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "district" TEXT,
    "postal_code" TEXT,
    "country" CHAR(2) NOT NULL DEFAULT 'CI',
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Abidjan',
    "currency" CHAR(3) NOT NULL DEFAULT 'XOF',
    "hotel_classification" "HotelClassification",
    "star_rating" INTEGER,
    "check_in_time" TEXT NOT NULL DEFAULT '15:00',
    "check_out_time" TEXT NOT NULL DEFAULT '11:00',
    "status" "PropertyStatus" NOT NULL DEFAULT 'ACTIVE',
    "logo_url" TEXT,
    "business_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_settings" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "value_type" TEXT NOT NULL DEFAULT 'string',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "property_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "username" TEXT,
    "password_hash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret" TEXT,
    "last_login_at" TIMESTAMPTZ(3),
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "name" TEXT NOT NULL,
    "code" "RoleCode",
    "description" TEXT,
    "is_system_role" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "property_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floors" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "building_id" UUID,
    "name" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "floors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amenities" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amenities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_types" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "short_description" TEXT,
    "capacity_adults" INTEGER NOT NULL DEFAULT 2,
    "capacity_children" INTEGER NOT NULL DEFAULT 0,
    "max_occupancy" INTEGER NOT NULL,
    "base_occupancy" INTEGER NOT NULL DEFAULT 2,
    "bed_configuration" TEXT,
    "surface_area" DECIMAL(8,2),
    "default_rate" BIGINT,
    "status" "PropertyStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "room_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "building_id" UUID,
    "floor_id" UUID,
    "room_type_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'AVAILABLE',
    "housekeeping_status" "HousekeepingStatus" NOT NULL DEFAULT 'CLEAN',
    "front_office_status" "FrontOfficeStatus" NOT NULL DEFAULT 'OPEN',
    "maintenance_status" "MaintenanceStatus" NOT NULL DEFAULT 'NONE',
    "floor_location" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_amenities" (
    "room_id" UUID NOT NULL,
    "amenity_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,

    CONSTRAINT "room_amenities_pkey" PRIMARY KEY ("room_id","amenity_id")
);

-- CreateTable
CREATE TABLE "room_type_amenities" (
    "room_type_id" UUID NOT NULL,
    "amenity_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,

    CONSTRAINT "room_type_amenities_pkey" PRIMARY KEY ("room_type_id","amenity_id")
);

-- CreateTable
CREATE TABLE "room_status_history" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "previous_status" "RoomStatus",
    "new_status" "RoomStatus" NOT NULL,
    "reason" TEXT,
    "reference_type" TEXT,
    "reference_id" UUID,
    "changed_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_plans" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "meal_plan" "MealPlan" NOT NULL DEFAULT 'ROOM_ONLY',
    "cancellation_policy_id" UUID,
    "payment_policy" TEXT,
    "is_refundable" BOOLEAN NOT NULL DEFAULT false,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_plan_prices" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "rate_plan_id" UUID NOT NULL,
    "room_type_id" UUID NOT NULL,
    "season_id" UUID,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE NOT NULL,
    "occupancy" INTEGER NOT NULL DEFAULT 2,
    "amount" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'XOF',
    "minimum_nights" INTEGER,
    "maximum_nights" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_plan_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cancellation_policies" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "deadline_hours" INTEGER NOT NULL DEFAULT 48,
    "penalty_type" "CancellationPenaltyType" NOT NULL DEFAULT 'NONE',
    "penaltyValue" BIGINT,
    "no_show_penalty_type" "CancellationPenaltyType" NOT NULL DEFAULT 'FIRST_NIGHT',
    "no_show_penalty_value" BIGINT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cancellation_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guests" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "guest_code" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "display_name" TEXT,
    "gender" TEXT,
    "date_of_birth" DATE,
    "nationality" TEXT,
    "country" CHAR(2),
    "phone" TEXT,
    "secondary_phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "region" TEXT,
    "company_id" UUID,
    "vip_level" "VipLevel" NOT NULL DEFAULT 'NONE',
    "notes" TEXT,
    "marketing_consent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_documents" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_number" TEXT NOT NULL,
    "issuing_country" CHAR(2),
    "issue_date" DATE,
    "expiry_date" DATE,
    "file_url" TEXT,
    "verified_at" TIMESTAMPTZ(3),
    "verified_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "guest_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_preferences" (
    "id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "preference_type" TEXT NOT NULL,
    "preference_value" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "rccm" TEXT,
    "tax_identifier" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" CHAR(2),
    "contact_person" TEXT,
    "payment_terms" TEXT,
    "credit_limit" BIGINT NOT NULL DEFAULT 0,
    "status" "PropertyStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agencies" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "registration_number" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "commission_type" TEXT,
    "commission_value" BIGINT,
    "payment_terms" TEXT,
    "status" "PropertyStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "reservation_number" TEXT NOT NULL,
    "source" "ReservationSource" NOT NULL DEFAULT 'DIRECT',
    "channel" TEXT,
    "status" "ReservationStatus" NOT NULL DEFAULT 'DRAFT',
    "guest_id" UUID NOT NULL,
    "company_id" UUID,
    "agency_id" UUID,
    "arrival_date" DATE NOT NULL,
    "departure_date" DATE NOT NULL,
    "nights" INTEGER NOT NULL,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "infants" INTEGER NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'XOF',
    "subtotal" BIGINT NOT NULL DEFAULT 0,
    "discount_amount" BIGINT NOT NULL DEFAULT 0,
    "tax_amount" BIGINT NOT NULL DEFAULT 0,
    "total_amount" BIGINT NOT NULL DEFAULT 0,
    "deposit_required" BOOLEAN NOT NULL DEFAULT false,
    "deposit_amount" BIGINT NOT NULL DEFAULT 0,
    "deposit_due_date" DATE,
    "special_requests" TEXT,
    "internal_notes" TEXT,
    "external_reference" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancellation_reason" TEXT,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_rooms" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "room_type_id" UUID NOT NULL,
    "room_id" UUID,
    "rate_plan_id" UUID NOT NULL,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "arrival_date" DATE NOT NULL,
    "departure_date" DATE NOT NULL,
    "number_of_nights" INTEGER NOT NULL,
    "base_amount" BIGINT NOT NULL,
    "discount_amount" BIGINT NOT NULL DEFAULT 0,
    "tax_amount" BIGINT NOT NULL DEFAULT 0,
    "total_amount" BIGINT NOT NULL,
    "status" "ReservationRoomStatus" NOT NULL DEFAULT 'RESERVED',
    "discount_type" TEXT,
    "discount_value" BIGINT,
    "discount_reason" TEXT,
    "discount_approved_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reservation_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_guests" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "role" "GuestRole" NOT NULL DEFAULT 'ADULT',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stays" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "stay_number" TEXT NOT NULL,
    "reservation_id" UUID NOT NULL,
    "primary_guest_id" UUID NOT NULL,
    "status" "StayStatus" NOT NULL DEFAULT 'EXPECTED',
    "actual_check_in_at" TIMESTAMPTZ(3),
    "actual_check_out_at" TIMESTAMPTZ(3),
    "planned_check_in" DATE NOT NULL,
    "planned_check_out" DATE NOT NULL,
    "assigned_by" UUID,
    "checked_in_by" UUID,
    "checked_out_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stay_rooms" (
    "id" UUID NOT NULL,
    "stay_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "room_type_id" UUID NOT NULL,
    "arrival_date" DATE NOT NULL,
    "departure_date" DATE NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" UUID,
    "released_at" TIMESTAMPTZ(3),

    CONSTRAINT "stay_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folios" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "folio_number" TEXT NOT NULL,
    "stay_id" UUID NOT NULL,
    "guest_id" UUID,
    "company_id" UUID,
    "status" "FolioStatus" NOT NULL DEFAULT 'OPEN',
    "currency" CHAR(3) NOT NULL DEFAULT 'XOF',
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),
    "balance" BIGINT NOT NULL DEFAULT 0,
    "credit_balance" BIGINT NOT NULL DEFAULT 0,
    "credit_limit" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "folios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folio_items" (
    "id" UUID NOT NULL,
    "folio_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "transaction_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "FolioItemType" NOT NULL,
    "category" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unit_amount" BIGINT NOT NULL,
    "discount_amount" BIGINT NOT NULL DEFAULT 0,
    "net_amount" BIGINT NOT NULL,
    "tax_amount" BIGINT NOT NULL DEFAULT 0,
    "gross_amount" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'XOF',
    "reference_type" TEXT,
    "reference_id" UUID,
    "posted_by" UUID,
    "idempotency_key" TEXT,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by" UUID,
    "void_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folio_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "payment_number" TEXT NOT NULL,
    "folio_id" UUID,
    "amount" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'XOF',
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
    "reference" TEXT,
    "external_reference" TEXT,
    "paid_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_by" UUID,
    "cash_session_id" UUID,
    "notes" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "folio_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "reason" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "approved_by" UUID,
    "processed_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "folio_id" UUID,
    "guest_id" UUID,
    "company_id" UUID,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "invoice_type" "InvoiceType" NOT NULL DEFAULT 'NORMAL',
    "currency" CHAR(3) NOT NULL DEFAULT 'XOF',
    "subtotal" BIGINT NOT NULL DEFAULT 0,
    "discount_amount" BIGINT NOT NULL DEFAULT 0,
    "tax_amount" BIGINT NOT NULL DEFAULT 0,
    "total_amount" BIGINT NOT NULL DEFAULT 0,
    "amount_paid" BIGINT NOT NULL DEFAULT 0,
    "balance_due" BIGINT NOT NULL DEFAULT 0,
    "issued_at" TIMESTAMPTZ(3),
    "due_at" DATE,
    "fne_status" "FneSubmissionStatus",
    "fne_reference" TEXT,
    "fne_number" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unit_price" BIGINT NOT NULL,
    "discount_amount" BIGINT NOT NULL DEFAULT 0,
    "net_amount" BIGINT NOT NULL,
    "tax_amount" BIGINT NOT NULL DEFAULT 0,
    "gross_amount" BIGINT NOT NULL,
    "tax_code" TEXT,
    "reference_type" TEXT,
    "reference_id" UUID,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rules" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "tax_type" TEXT NOT NULL,
    "jurisdiction" "NightTaxJurisdiction" NOT NULL DEFAULT 'NATIONAL',
    "calculation_method" "TaxCalculationMethod" NOT NULL DEFAULT 'PERCENTAGE',
    "rate" DECIMAL(7,4),
    "fixed_amount" BIGINT,
    "is_inclusive" BOOLEAN NOT NULL DEFAULT false,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "conditions" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tax_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "night_tax_configurations" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "hotel_classification" "HotelClassification" NOT NULL,
    "amount_per_night" BIGINT NOT NULL,
    "jurisdiction_type" "NightTaxJurisdiction" NOT NULL DEFAULT 'MUNICIPAL',
    "beneficiary_type" TEXT NOT NULL,
    "collection_period" TEXT NOT NULL DEFAULT 'MONTHLY',
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "night_tax_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_obligations" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "tax_type" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "amount_due" BIGINT NOT NULL DEFAULT 0,
    "amount_declared" BIGINT NOT NULL DEFAULT 0,
    "amount_paid" BIGINT NOT NULL DEFAULT 0,
    "status" "TaxObligationStatus" NOT NULL DEFAULT 'PENDING',
    "due_date" DATE,
    "submitted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tax_obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fne_documents" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "external_reference" TEXT,
    "submissionStatus" "FneSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "fne_number" TEXT,
    "certification_reference" TEXT,
    "qr_code_data" TEXT,
    "submitted_at" TIMESTAMPTZ(3),
    "certified_at" TIMESTAMPTZ(3),
    "rejected_at" TIMESTAMPTZ(3),
    "rejection_reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "submitted_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fne_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fne_submission_attempts" (
    "id" UUID NOT NULL,
    "fne_document_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "request_id" TEXT,
    "correlation_id" TEXT,
    "status" "FneSubmissionStatus" NOT NULL,
    "response_code" INTEGER,
    "response_body_sanitized" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fne_submission_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_registers" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "location" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cash_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" UUID NOT NULL,
    "cash_register_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opening_balance" BIGINT NOT NULL DEFAULT 0,
    "closing_balance" BIGINT,
    "expected_balance" BIGINT,
    "difference" BIGINT,
    "variance_reason" TEXT,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMPTZ(3),
    "closed_by" UUID,

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" UUID NOT NULL,
    "cash_session_id" UUID NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "reason" TEXT,
    "reference_type" TEXT,
    "reference_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "housekeeping_tasks" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "task_type" "HousekeepingTaskType" NOT NULL,
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "HousekeepingTaskStatus" NOT NULL DEFAULT 'PENDING',
    "assigned_to" UUID,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "verified_at" TIMESTAMPTZ(3),
    "verified_by" UUID,
    "reference_type" TEXT,
    "reference_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "housekeeping_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "room_id" UUID,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "serial_number" TEXT,
    "manufacturer" TEXT,
    "purchase_date" DATE,
    "warranty_end" DATE,
    "status" "AssetStatus" NOT NULL DEFAULT 'IN_SERVICE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_tickets" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "room_id" UUID,
    "asset_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "MaintenanceTicketStatus" NOT NULL DEFAULT 'OPEN',
    "reported_by" UUID,
    "assigned_to" UUID,
    "estimated_cost" BIGINT,
    "actual_cost" BIGINT,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "maintenance_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "night_audits" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "status" "NightAuditStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "started_by" UUID,
    "completed_by" UUID,
    "total_room_revenue" BIGINT NOT NULL DEFAULT 0,
    "total_other_revenue" BIGINT NOT NULL DEFAULT 0,
    "total_tax" BIGINT NOT NULL DEFAULT 0,
    "total_payments" BIGINT NOT NULL DEFAULT 0,
    "variance" BIGINT NOT NULL DEFAULT 0,
    "error_summary" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "night_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_hotel_metrics" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "available_rooms" INTEGER NOT NULL DEFAULT 0,
    "occupied_rooms" INTEGER NOT NULL DEFAULT 0,
    "out_of_order_rooms" INTEGER NOT NULL DEFAULT 0,
    "occupancy_rate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "room_revenue" BIGINT NOT NULL DEFAULT 0,
    "other_revenue" BIGINT NOT NULL DEFAULT 0,
    "gross_revenue" BIGINT NOT NULL DEFAULT 0,
    "tax_revenue" BIGINT NOT NULL DEFAULT 0,
    "adr" BIGINT NOT NULL DEFAULT 0,
    "revpar" BIGINT NOT NULL DEFAULT 0,
    "payments" BIGINT NOT NULL DEFAULT 0,
    "outstanding" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "daily_hotel_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "property_id" UUID,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resource_id" UUID,
    "before_data" JSONB,
    "after_data" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "correlation_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "property_id" UUID,
    "key" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "property_id" UUID,
    "event_type" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" UUID,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "user_id" UUID,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "event_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "payload" JSONB,
    "read_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_status_idx" ON "organizations"("status");

-- CreateIndex
CREATE INDEX "properties_organization_id_idx" ON "properties"("organization_id");

-- CreateIndex
CREATE INDEX "properties_organization_id_status_idx" ON "properties"("organization_id", "status");

-- CreateIndex
CREATE INDEX "properties_status_idx" ON "properties"("status");

-- CreateIndex
CREATE UNIQUE INDEX "properties_organization_id_code_key" ON "properties"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "properties_organization_id_slug_key" ON "properties"("organization_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "property_settings_property_id_key_key" ON "property_settings"("property_id", "key");

-- CreateIndex
CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_organization_id_email_key" ON "users"("organization_id", "email");

-- CreateIndex
CREATE INDEX "roles_organization_id_idx" ON "roles"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_organization_id_code_key" ON "roles"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_resource_action_key" ON "permissions"("resource", "action");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "buildings_property_id_code_key" ON "buildings"("property_id", "code");

-- CreateIndex
CREATE INDEX "floors_property_id_idx" ON "floors"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "floors_property_id_building_id_number_key" ON "floors"("property_id", "building_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "amenities_property_id_code_key" ON "amenities"("property_id", "code");

-- CreateIndex
CREATE INDEX "room_types_property_id_status_idx" ON "room_types"("property_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "room_types_property_id_code_key" ON "room_types"("property_id", "code");

-- CreateIndex
CREATE INDEX "rooms_property_id_status_idx" ON "rooms"("property_id", "status");

-- CreateIndex
CREATE INDEX "rooms_property_id_room_type_id_idx" ON "rooms"("property_id", "room_type_id");

-- CreateIndex
CREATE INDEX "rooms_property_id_housekeeping_status_idx" ON "rooms"("property_id", "housekeeping_status");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_property_id_number_key" ON "rooms"("property_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_property_id_code_key" ON "rooms"("property_id", "code");

-- CreateIndex
CREATE INDEX "room_amenities_property_id_idx" ON "room_amenities"("property_id");

-- CreateIndex
CREATE INDEX "room_type_amenities_property_id_idx" ON "room_type_amenities"("property_id");

-- CreateIndex
CREATE INDEX "room_status_history_property_id_created_at_idx" ON "room_status_history"("property_id", "created_at");

-- CreateIndex
CREATE INDEX "room_status_history_room_id_created_at_idx" ON "room_status_history"("room_id", "created_at");

-- CreateIndex
CREATE INDEX "rate_plans_property_id_is_active_idx" ON "rate_plans"("property_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "rate_plans_property_id_code_key" ON "rate_plans"("property_id", "code");

-- CreateIndex
CREATE INDEX "seasons_property_id_start_date_end_date_idx" ON "seasons"("property_id", "start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "seasons_property_id_name_key" ON "seasons"("property_id", "name");

-- CreateIndex
CREATE INDEX "rate_plan_prices_property_id_valid_from_valid_to_idx" ON "rate_plan_prices"("property_id", "valid_from", "valid_to");

-- CreateIndex
CREATE UNIQUE INDEX "rate_plan_prices_rate_plan_id_room_type_id_season_id_valid__key" ON "rate_plan_prices"("rate_plan_id", "room_type_id", "season_id", "valid_from", "occupancy");

-- CreateIndex
CREATE UNIQUE INDEX "cancellation_policies_property_id_name_key" ON "cancellation_policies"("property_id", "name");

-- CreateIndex
CREATE INDEX "guests_property_id_phone_idx" ON "guests"("property_id", "phone");

-- CreateIndex
CREATE INDEX "guests_property_id_email_idx" ON "guests"("property_id", "email");

-- CreateIndex
CREATE INDEX "guests_property_id_last_name_idx" ON "guests"("property_id", "last_name");

-- CreateIndex
CREATE UNIQUE INDEX "guests_property_id_guest_code_key" ON "guests"("property_id", "guest_code");

-- CreateIndex
CREATE INDEX "guest_documents_property_id_guest_id_idx" ON "guest_documents"("property_id", "guest_id");

-- CreateIndex
CREATE UNIQUE INDEX "guest_preferences_guest_id_preference_type_key" ON "guest_preferences"("guest_id", "preference_type");

-- CreateIndex
CREATE INDEX "companies_property_id_idx" ON "companies"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_property_id_name_key" ON "companies"("property_id", "name");

-- CreateIndex
CREATE INDEX "agencies_property_id_idx" ON "agencies"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "agencies_property_id_name_key" ON "agencies"("property_id", "name");

-- CreateIndex
CREATE INDEX "reservations_property_id_arrival_date_idx" ON "reservations"("property_id", "arrival_date");

-- CreateIndex
CREATE INDEX "reservations_property_id_departure_date_idx" ON "reservations"("property_id", "departure_date");

-- CreateIndex
CREATE INDEX "reservations_property_id_status_idx" ON "reservations"("property_id", "status");

-- CreateIndex
CREATE INDEX "reservations_property_id_status_arrival_date_idx" ON "reservations"("property_id", "status", "arrival_date");

-- CreateIndex
CREATE INDEX "reservations_guest_id_idx" ON "reservations"("guest_id");

-- CreateIndex
CREATE INDEX "reservations_property_id_external_reference_idx" ON "reservations"("property_id", "external_reference");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_property_id_reservation_number_key" ON "reservations"("property_id", "reservation_number");

-- CreateIndex
CREATE INDEX "reservation_rooms_reservation_id_idx" ON "reservation_rooms"("reservation_id");

-- CreateIndex
CREATE INDEX "reservation_rooms_property_id_room_type_id_arrival_date_dep_idx" ON "reservation_rooms"("property_id", "room_type_id", "arrival_date", "departure_date");

-- CreateIndex
CREATE INDEX "reservation_rooms_room_id_idx" ON "reservation_rooms"("room_id");

-- CreateIndex
CREATE INDEX "reservation_guests_guest_id_idx" ON "reservation_guests"("guest_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_guests_reservation_id_guest_id_key" ON "reservation_guests"("reservation_id", "guest_id");

-- CreateIndex
CREATE INDEX "stays_property_id_status_idx" ON "stays"("property_id", "status");

-- CreateIndex
CREATE INDEX "stays_property_id_planned_check_in_planned_check_out_idx" ON "stays"("property_id", "planned_check_in", "planned_check_out");

-- CreateIndex
CREATE UNIQUE INDEX "stays_property_id_stay_number_key" ON "stays"("property_id", "stay_number");

-- CreateIndex
CREATE UNIQUE INDEX "stays_reservation_id_key" ON "stays"("reservation_id");

-- CreateIndex
CREATE INDEX "stay_rooms_stay_id_idx" ON "stay_rooms"("stay_id");

-- CreateIndex
CREATE INDEX "stay_rooms_property_id_room_id_arrival_date_departure_date_idx" ON "stay_rooms"("property_id", "room_id", "arrival_date", "departure_date");

-- CreateIndex
CREATE INDEX "stay_rooms_room_id_idx" ON "stay_rooms"("room_id");

-- CreateIndex
CREATE INDEX "folios_stay_id_idx" ON "folios"("stay_id");

-- CreateIndex
CREATE INDEX "folios_property_id_status_idx" ON "folios"("property_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "folios_property_id_folio_number_key" ON "folios"("property_id", "folio_number");

-- CreateIndex
CREATE INDEX "folio_items_folio_id_idx" ON "folio_items"("folio_id");

-- CreateIndex
CREATE INDEX "folio_items_folio_id_business_date_idx" ON "folio_items"("folio_id", "business_date");

-- CreateIndex
CREATE INDEX "folio_items_property_id_business_date_idx" ON "folio_items"("property_id", "business_date");

-- CreateIndex
CREATE INDEX "folio_items_idempotency_key_idx" ON "folio_items"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_folio_id_idx" ON "payments"("folio_id");

-- CreateIndex
CREATE INDEX "payments_property_id_paid_at_idx" ON "payments"("property_id", "paid_at");

-- CreateIndex
CREATE INDEX "payments_property_id_status_paid_at_idx" ON "payments"("property_id", "status", "paid_at");

-- CreateIndex
CREATE INDEX "payments_idempotency_key_idx" ON "payments"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payments_property_id_payment_number_key" ON "payments"("property_id", "payment_number");

-- CreateIndex
CREATE INDEX "payment_allocations_folio_id_idx" ON "payment_allocations"("folio_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_payment_id_folio_id_key" ON "payment_allocations"("payment_id", "folio_id");

-- CreateIndex
CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");

-- CreateIndex
CREATE INDEX "refunds_property_id_status_idx" ON "refunds"("property_id", "status");

-- CreateIndex
CREATE INDEX "invoices_property_id_issued_at_idx" ON "invoices"("property_id", "issued_at");

-- CreateIndex
CREATE INDEX "invoices_property_id_status_idx" ON "invoices"("property_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_property_id_invoice_number_key" ON "invoices"("property_id", "invoice_number");

-- CreateIndex
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");

-- CreateIndex
CREATE INDEX "tax_rules_property_id_is_active_effective_from_idx" ON "tax_rules"("property_id", "is_active", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "tax_rules_property_id_code_key" ON "tax_rules"("property_id", "code");

-- CreateIndex
CREATE INDEX "night_tax_configurations_property_id_is_active_idx" ON "night_tax_configurations"("property_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "night_tax_configurations_property_id_hotel_classification_e_key" ON "night_tax_configurations"("property_id", "hotel_classification", "effective_from");

-- CreateIndex
CREATE INDEX "tax_obligations_property_id_status_idx" ON "tax_obligations"("property_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tax_obligations_property_id_tax_type_period_start_period_en_key" ON "tax_obligations"("property_id", "tax_type", "period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "fne_documents_invoice_id_key" ON "fne_documents"("invoice_id");

-- CreateIndex
CREATE INDEX "fne_documents_property_id_submissionStatus_idx" ON "fne_documents"("property_id", "submissionStatus");

-- CreateIndex
CREATE INDEX "fne_submission_attempts_fne_document_id_created_at_idx" ON "fne_submission_attempts"("fne_document_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "fne_submission_attempts_fne_document_id_attempt_number_key" ON "fne_submission_attempts"("fne_document_id", "attempt_number");

-- CreateIndex
CREATE UNIQUE INDEX "cash_registers_property_id_code_key" ON "cash_registers"("property_id", "code");

-- CreateIndex
CREATE INDEX "cash_sessions_property_id_status_idx" ON "cash_sessions"("property_id", "status");

-- CreateIndex
CREATE INDEX "cash_sessions_cash_register_id_status_idx" ON "cash_sessions"("cash_register_id", "status");

-- CreateIndex
CREATE INDEX "cash_movements_cash_session_id_created_at_idx" ON "cash_movements"("cash_session_id", "created_at");

-- CreateIndex
CREATE INDEX "housekeeping_tasks_property_id_status_idx" ON "housekeeping_tasks"("property_id", "status");

-- CreateIndex
CREATE INDEX "housekeeping_tasks_room_id_status_idx" ON "housekeeping_tasks"("room_id", "status");

-- CreateIndex
CREATE INDEX "housekeeping_tasks_property_id_assigned_to_status_idx" ON "housekeeping_tasks"("property_id", "assigned_to", "status");

-- CreateIndex
CREATE INDEX "assets_property_id_status_idx" ON "assets"("property_id", "status");

-- CreateIndex
CREATE INDEX "maintenance_tickets_property_id_status_idx" ON "maintenance_tickets"("property_id", "status");

-- CreateIndex
CREATE INDEX "maintenance_tickets_room_id_idx" ON "maintenance_tickets"("room_id");

-- CreateIndex
CREATE INDEX "night_audits_property_id_status_idx" ON "night_audits"("property_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "night_audits_property_id_business_date_key" ON "night_audits"("property_id", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_hotel_metrics_property_id_business_date_key" ON "daily_hotel_metrics"("property_id", "business_date");

-- CreateIndex
CREATE INDEX "audit_logs_property_id_created_at_idx" ON "audit_logs"("property_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_resource_resource_id_idx" ON "audit_logs"("resource", "resource_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_organization_id_key_operation_key" ON "idempotency_keys"("organization_id", "key", "operation");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");

-- CreateIndex
CREATE INDEX "outbox_events_property_id_created_at_idx" ON "outbox_events"("property_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_property_id_read_at_idx" ON "notifications"("property_id", "read_at");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_settings" ADD CONSTRAINT "property_settings_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floors" ADD CONSTRAINT "floors_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floors" ADD CONSTRAINT "floors_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amenities" ADD CONSTRAINT "amenities_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_amenities" ADD CONSTRAINT "room_amenities_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_amenities" ADD CONSTRAINT "room_amenities_amenity_id_fkey" FOREIGN KEY ("amenity_id") REFERENCES "amenities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_amenities" ADD CONSTRAINT "room_amenities_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_type_amenities" ADD CONSTRAINT "room_type_amenities_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_type_amenities" ADD CONSTRAINT "room_type_amenities_amenity_id_fkey" FOREIGN KEY ("amenity_id") REFERENCES "amenities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_type_amenities" ADD CONSTRAINT "room_type_amenities_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_status_history" ADD CONSTRAINT "room_status_history_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_status_history" ADD CONSTRAINT "room_status_history_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_cancellation_policy_id_fkey" FOREIGN KEY ("cancellation_policy_id") REFERENCES "cancellation_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_plan_prices" ADD CONSTRAINT "rate_plan_prices_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_plan_prices" ADD CONSTRAINT "rate_plan_prices_rate_plan_id_fkey" FOREIGN KEY ("rate_plan_id") REFERENCES "rate_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_plan_prices" ADD CONSTRAINT "rate_plan_prices_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_plan_prices" ADD CONSTRAINT "rate_plan_prices_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellation_policies" ADD CONSTRAINT "cancellation_policies_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_documents" ADD CONSTRAINT "guest_documents_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_documents" ADD CONSTRAINT "guest_documents_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_preferences" ADD CONSTRAINT "guest_preferences_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_rooms" ADD CONSTRAINT "reservation_rooms_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_rooms" ADD CONSTRAINT "reservation_rooms_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_rooms" ADD CONSTRAINT "reservation_rooms_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_rooms" ADD CONSTRAINT "reservation_rooms_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_rooms" ADD CONSTRAINT "reservation_rooms_rate_plan_id_fkey" FOREIGN KEY ("rate_plan_id") REFERENCES "rate_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_guests" ADD CONSTRAINT "reservation_guests_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_guests" ADD CONSTRAINT "reservation_guests_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stays" ADD CONSTRAINT "stays_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stays" ADD CONSTRAINT "stays_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stays" ADD CONSTRAINT "stays_primary_guest_id_fkey" FOREIGN KEY ("primary_guest_id") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stay_rooms" ADD CONSTRAINT "stay_rooms_stay_id_fkey" FOREIGN KEY ("stay_id") REFERENCES "stays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stay_rooms" ADD CONSTRAINT "stay_rooms_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stay_rooms" ADD CONSTRAINT "stay_rooms_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stay_rooms" ADD CONSTRAINT "stay_rooms_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folios" ADD CONSTRAINT "folios_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folios" ADD CONSTRAINT "folios_stay_id_fkey" FOREIGN KEY ("stay_id") REFERENCES "stays"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folios" ADD CONSTRAINT "folios_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folios" ADD CONSTRAINT "folios_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folio_items" ADD CONSTRAINT "folio_items_folio_id_fkey" FOREIGN KEY ("folio_id") REFERENCES "folios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folio_items" ADD CONSTRAINT "folio_items_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_folio_id_fkey" FOREIGN KEY ("folio_id") REFERENCES "folios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_folio_id_fkey" FOREIGN KEY ("folio_id") REFERENCES "folios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "night_tax_configurations" ADD CONSTRAINT "night_tax_configurations_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_obligations" ADD CONSTRAINT "tax_obligations_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fne_documents" ADD CONSTRAINT "fne_documents_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fne_documents" ADD CONSTRAINT "fne_documents_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fne_documents" ADD CONSTRAINT "fne_documents_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fne_submission_attempts" ADD CONSTRAINT "fne_submission_attempts_fne_document_id_fkey" FOREIGN KEY ("fne_document_id") REFERENCES "fne_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_cash_register_id_fkey" FOREIGN KEY ("cash_register_id") REFERENCES "cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "night_audits" ADD CONSTRAINT "night_audits_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_hotel_metrics" ADD CONSTRAINT "daily_hotel_metrics_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===========================================================================
-- Extensions et contraintes non expressibles dans le schéma Prisma.
-- Elles portent les garanties d'intégrité les plus critiques du PMS.
-- ===========================================================================

-- btree_gist est requis par les contraintes d'exclusion ci-dessous : sans
-- lui, PostgreSQL ne peut pas combiner une égalité sur uuid avec un
-- chevauchement d'intervalle de dates.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Contrôles de cohérence sur les montants et les périodes.
-- Un folio item reste toujours décomposé net + taxe = brut.
ALTER TABLE "folio_items"
  ADD CONSTRAINT "folio_items_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "folio_items"
  ADD CONSTRAINT "folio_items_gross_consistent"
  CHECK ("gross_amount" = "net_amount" + "tax_amount");

ALTER TABLE "folio_items"
  ADD CONSTRAINT "folio_items_unit_amount_non_negative" CHECK ("unit_amount" >= 0);

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_dates_valid"
  CHECK ("departure_date" > "arrival_date");

ALTER TABLE "reservation_rooms"
  ADD CONSTRAINT "reservation_rooms_dates_valid"
  CHECK ("departure_date" > "arrival_date");

ALTER TABLE "stays"
  ADD CONSTRAINT "stays_dates_valid" CHECK ("planned_check_out" > "planned_check_in");

-- Le nombre de nuitées doit correspondre à l'intervalle demandé.
ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_nights_consistent"
  CHECK ("nights" = "departure_date" - "arrival_date");

-- ---------------------------------------------------------------------------
-- Idempotence (sections 70, 55, 81 règle 9).
-- Un index unique partiel garantit qu'une clé d'idempotence ne puisse
-- jamais être consommée deux fois : un paiement rejoué ou un night audit
-- relancé ne produisent pas de doublon.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "folio_items_idempotency_key_unique"
  ON "folio_items" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

CREATE UNIQUE INDEX "payments_idempotency_key_unique"
  ON "payments" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Anti-double réservation (section 45).
-- Le comptage exact des chambres disponibles et la sérialisation des
-- réservations concurrentes sont assurés par la AvailabilityService dans
-- une transaction SERIALIZABLE. Ces index Diet aux requêtes de
-- disponibilité à ne lire que l'inventaire réellement engagé.
-- ---------------------------------------------------------------------------
CREATE INDEX "reservation_rooms_availability_lookup"
  ON "reservation_rooms" ("property_id", "room_type_id", "arrival_date", "departure_date")
  WHERE "status" IN ('RESERVED', 'OCCUPIED');

CREATE INDEX "stay_rooms_occupancy_lookup"
  ON "stay_rooms" ("property_id", "room_id", "arrival_date", "departure_date")
  WHERE "released_at" IS NULL;

-- Une facture finalisée devient immuable : la contrainte Trigger empêche
-- toute écriture sur une facture Certified sans nouvelle transition
-- explicite (section 81 règle 7).
CREATE OR REPLACE FUNCTION prevent_finalized_invoice_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('CERTIFIED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Invoice % is finalized and cannot be modified', OLD.invoice_number
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "invoices_immutable_after_finalization"
  BEFORE UPDATE OR DELETE ON "invoices"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_finalized_invoice_mutation();

-- Mode ALWAYS pour la même raison que les triggers d'intégrité financière :
-- un trigger en mode ENABLE n'est pas exécuté pour le rôle propriétaire, et
-- l'application utilise ce rôle. Sans ALWAYS, la règle 7 serait contournable.
ALTER TABLE "invoices" ENABLE ALWAYS TRIGGER "invoices_immutable_after_finalization";

-- Un folio item financier n'est jamais supprimé physiquement
-- (section 24, règle 81/5) : seule l'annulation logique via void est admise.
CREATE OR REPLACE FUNCTION prevent_financial_row_deletion()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Financial rows cannot be physically deleted: %', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "folio_items_no_physical_delete"
  BEFORE DELETE ON "folio_items"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_financial_row_deletion();

CREATE TRIGGER "payments_no_physical_delete"
  BEFORE DELETE ON "payments"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_financial_row_deletion();

CREATE TRIGGER "invoices_no_physical_delete"
  BEFORE DELETE ON "invoices"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_financial_row_deletion();

-- Mode ALWAYS : un trigger en mode ENABLE n'est pas exécuté pour le rôle
-- propriétaire de la table. L'application utilise précisément ce rôle, la
-- garantie d'intégrité comptable serait donc contournable. `ENABLE ALWAYS`
-- exécute le trigger y compris pour le propriétaire.
ALTER TABLE "folio_items" ENABLE ALWAYS TRIGGER "folio_items_no_physical_delete";
ALTER TABLE "payments" ENABLE ALWAYS TRIGGER "payments_no_physical_delete";
ALTER TABLE "invoices" ENABLE ALWAYS TRIGGER "invoices_no_physical_delete";

