
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  target_ai TEXT NOT NULL DEFAULT 'ChatGPT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO anon, authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open projects" ON public.projects FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.account_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_number INT NOT NULL UNIQUE CHECK (slot_number BETWEEN 1 AND 10),
  ai_system TEXT NOT NULL DEFAULT 'ChatGPT',
  label TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_slots TO anon, authenticated;
GRANT ALL ON public.account_slots TO service_role;
ALTER TABLE public.account_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open slots" ON public.account_slots FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.account_slots (slot_number, ai_system, label) VALUES
  (1,'ChatGPT','Account 1'),(2,'ChatGPT','Account 2'),
  (3,'Claude','Account 3'),(4,'Claude','Account 4'),
  (5,'Gemini','Account 5'),(6,'Gemini','Account 6'),
  (7,'DeepSeek','Account 7'),(8,'DeepSeek','Account 8'),
  (9,'ChatGPT','Account 9'),(10,'Claude','Account 10');

CREATE TABLE public.chat_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  slot_id UUID REFERENCES public.account_slots(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_logs TO anon, authenticated;
GRANT ALL ON public.chat_logs TO service_role;
ALTER TABLE public.chat_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open logs" ON public.chat_logs FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX chat_logs_project_idx ON public.chat_logs(project_id, order_index);
