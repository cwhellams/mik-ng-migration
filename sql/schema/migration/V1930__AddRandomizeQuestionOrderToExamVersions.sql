ALTER TABLE exam.exam_versions
  ADD COLUMN randomize_question_order BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN exam.exam_versions.randomize_question_order IS
  'When true (the default, and the behaviour of every version created before this column existed), each attempt shuffles the questions and question_count may draw a random subset. When false the attempt presents every question of the version in the authored sort_order and question_count is ignored.';
