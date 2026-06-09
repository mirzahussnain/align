// UK Tech Market ATS Keywords Database
// Organized by category for scoring and gap analysis

export const UK_TECH_KEYWORDS = {
  languages: [
    'TypeScript', 'JavaScript', 'Python', 'Java', 'C#', 'Go', 'Rust',
    'Kotlin', 'Swift', 'Ruby', 'PHP', 'Scala', 'SQL', 'HTML', 'CSS',
  ],
  frontend: [
    'React', 'React.js', 'Next.js', 'Vue', 'Vue.js', 'Angular', 'Svelte',
    'Tailwind', 'Tailwind CSS', 'SASS', 'SCSS', 'Styled Components',
    'Framer Motion', 'GSAP', 'Redux', 'Zustand', 'React Query',
    'Storybook', 'Webpack', 'Vite', 'Turbopack',
  ],
  backend: [
    'Node.js', 'Express', 'Express.js', 'FastAPI', 'Django', 'Flask',
    'Spring Boot', 'NestJS', 'GraphQL', 'REST', 'REST API', 'gRPC',
    'Microservices', 'WebSocket', 'WebSockets', 'RabbitMQ', 'Kafka',
    'Redis', 'Prisma', 'TypeORM', 'Sequelize', 'SQLAlchemy',
  ],
  databases: [
    'PostgreSQL', 'MySQL', 'MongoDB', 'DynamoDB', 'Cassandra',
    'Elasticsearch', 'Supabase', 'Firebase', 'CosmosDB', 'Redis',
  ],
  cloud: [
    'AWS', 'Amazon Web Services', 'Azure', 'Microsoft Azure', 'GCP',
    'Google Cloud', 'Vercel', 'Netlify', 'Heroku', 'DigitalOcean',
    'Cloudflare', 'S3', 'EC2', 'Lambda', 'ECS', 'EKS',
  ],
  devops: [
    'Docker', 'Kubernetes', 'K8s', 'Terraform', 'Ansible', 'Jenkins',
    'GitHub Actions', 'GitLab CI', 'CI/CD', 'Infrastructure as Code',
    'IaC', 'Helm', 'ArgoCD', 'Prometheus', 'Grafana',
  ],
  testing: [
    'Jest', 'Vitest', 'Cypress', 'Playwright', 'Selenium',
    'React Testing Library', 'Mocha', 'Chai', 'Supertest',
    'TDD', 'BDD', 'Unit Testing', 'Integration Testing',
    'E2E Testing', 'End-to-End Testing', 'Test Coverage',
    'Snapshot Testing', 'Load Testing', 'Performance Testing',
  ],
  ai_ml: [
    'Machine Learning', 'Deep Learning', 'NLP', 'Natural Language Processing',
    'LLM', 'GPT', 'RAG', 'LangChain', 'OpenAI', 'Hugging Face',
    'TensorFlow', 'PyTorch', 'scikit-learn', 'Pandas', 'NumPy',
    'Computer Vision', 'SpaCy', 'BERT', 'Transformers',
    'Vector Database', 'pgvector', 'Pinecone', 'Embeddings',
  ],
  practices: [
    'Agile', 'Scrum', 'Kanban', 'Sprint', 'Stand-up', 'Retrospective',
    'Code Review', 'Pull Request', 'Pair Programming', 'Mob Programming',
    'Clean Code', 'SOLID', 'Design Patterns', 'DRY', 'YAGNI',
    'Accessibility', 'WCAG', 'a11y', 'SEO', 'Core Web Vitals',
    'Responsive Design', 'Mobile First', 'Performance Optimisation',
  ],
  monitoring: [
    'Sentry', 'Datadog', 'New Relic', 'LogRocket', 'Splunk',
    'CloudWatch', 'ELK Stack', 'Kibana', 'Logging', 'Monitoring',
    'Observability', 'APM', 'Alerting',
  ],
  security: [
    'OAuth', 'JWT', 'RBAC', 'OWASP', 'XSS', 'CSRF', 'SQL Injection',
    'Encryption', 'HTTPS', 'TLS', 'SSO', 'SAML', 'MFA', '2FA',
    'Penetration Testing', 'Security Audit',
  ],
  tools: [
    'Git', 'GitHub', 'GitLab', 'Bitbucket', 'Jira', 'Confluence',
    'Notion', 'Figma', 'Postman', 'Swagger', 'VS Code',
    'Linux', 'Bash', 'Shell Scripting',
  ],
} as const;

export type KeywordCategory = keyof typeof UK_TECH_KEYWORDS;

export const KEYWORD_CATEGORY_LABELS: Record<KeywordCategory, string> = {
  languages: 'Programming Languages',
  frontend: 'Frontend',
  backend: 'Backend',
  databases: 'Databases',
  cloud: 'Cloud & Hosting',
  devops: 'DevOps & CI/CD',
  testing: 'Testing',
  ai_ml: 'AI & Machine Learning',
  practices: 'Engineering Practices',
  monitoring: 'Monitoring & Observability',
  security: 'Security',
  tools: 'Tools & Platforms',
};

// Flatten all keywords for quick lookup
export const ALL_KEYWORDS = Object.values(UK_TECH_KEYWORDS).flat();
