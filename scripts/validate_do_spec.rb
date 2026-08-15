#!/usr/bin/env ruby
# Validates a DigitalOcean app spec after envsubst/perl substitution has run.
# Run as: ruby scripts/validate_do_spec.rb <path-to-spec.yaml>
#
# Never prints the offending value — only the "- key: NAME" it falls under —
# so a bad substitution can be diagnosed from CI logs without leaking secrets.

require 'yaml'

path = ARGV[0]
abort 'Usage: validate_do_spec.rb <path-to-spec.yaml>' unless path

begin
  YAML.safe_load(File.read(path), permitted_classes: [], permitted_symbols: [], aliases: false)
  puts "#{path}: YAML is valid."
rescue Psych::SyntaxError => e
  bad_line = e.respond_to?(:line) ? e.line : (e.message[/line (\d+)/, 1]&.to_i)

  problem = e.respond_to?(:problem) ? e.problem : 'YAML syntax error'
  loc = bad_line ? " at line #{bad_line}" : ''
  puts "::error::Invalid YAML in #{path} after substitution: #{problem}#{loc}"

  if bad_line
    lines = File.readlines(path)
    key = nil
    bad_line.downto(1) do |i|
      if lines[i - 1] =~ /- key:\s*(\S+)/
        key = Regexp.last_match(1)
        break
      end
    end
    puts "::error::Likely offending variable: #{key} (value not printed — check its GitHub Environment configuration for embedded quote characters)" if key
  end

  exit 1
end
