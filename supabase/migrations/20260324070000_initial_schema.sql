CREATE TYPE user_role AS ENUM ('admin', 'employee');
CREATE TYPE plan_status AS ENUM ('draft', 'open', 'closed', 'generated', 'published');
CREATE TYPE wish_type AS ENUM ('available', 'custom_time', 'unavailable');

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role user_role DEFAULT 'employee',
    has_drivers_license BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE shift_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    default_start_time TIME NOT NULL,
    default_end_time TIME NOT NULL,
    color TEXT DEFAULT '#3B82F6',
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO shift_types (name, default_start_time, default_end_time, color, sort_order) VALUES
('Frühschicht', '10:00', '15:00', '#3B82F6', 1),
('Spätschicht', '18:00', '23:00', '#8B5CF6', 2);

CREATE TABLE monthly_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    year INT NOT NULL,
    month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
    status plan_status DEFAULT 'draft',
    submission_deadline DATE,
    min_staff_per_shift INT DEFAULT 1,
    notes TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(year, month)
);

CREATE TABLE shift_type_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monthly_plan_id UUID REFERENCES monthly_plans(id) ON DELETE CASCADE,
    shift_type_id UUID REFERENCES shift_types(id) ON DELETE CASCADE,
    override_start_time TIME NOT NULL,
    override_end_time TIME NOT NULL,
    UNIQUE(monthly_plan_id, shift_type_id)
);

CREATE TABLE shift_wishes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monthly_plan_id UUID REFERENCES monthly_plans(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    shift_type_id UUID REFERENCES shift_types(id),
    wish_type wish_type NOT NULL DEFAULT 'available',
    custom_start_time TIME,
    custom_end_time TIME,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(monthly_plan_id, employee_id, date, shift_type_id)
);

CREATE TABLE wish_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monthly_plan_id UUID REFERENCES monthly_plans(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    submitted_at TIMESTAMPTZ DEFAULT now(),
    is_submitted BOOLEAN DEFAULT false,
    UNIQUE(monthly_plan_id, employee_id)
);

CREATE TABLE schedule_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monthly_plan_id UUID REFERENCES monthly_plans(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    shift_type_id UUID REFERENCES shift_types(id),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_manual_override BOOLEAN DEFAULT false,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(monthly_plan_id, employee_id, date, shift_type_id)
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_wishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE wish_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles"
    ON profiles FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
CREATE POLICY "Admins can manage profiles"
    ON profiles FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Everyone can view shift types"
    ON shift_types FOR SELECT USING (true);
CREATE POLICY "Admins manage shift types"
    ON shift_types FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Employees view open/published plans"
    ON monthly_plans FOR SELECT USING (
        status IN ('open', 'published')
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
CREATE POLICY "Admins manage plans"
    ON monthly_plans FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Employees manage own wishes"
    ON shift_wishes FOR ALL USING (
        employee_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM monthly_plans
            WHERE id = monthly_plan_id AND status = 'open'
        )
    );
CREATE POLICY "Admins view all wishes"
    ON shift_wishes FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Employees view published schedule"
    ON schedule_assignments FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM monthly_plans
            WHERE id = monthly_plan_id AND status = 'published'
        )
    );
CREATE POLICY "Admins manage schedule"
    ON schedule_assignments FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
