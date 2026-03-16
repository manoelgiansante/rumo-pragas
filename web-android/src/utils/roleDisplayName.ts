export function roleDisplayName(role: string): string {
  switch (role) {
    case 'produtor': return 'Produtor Rural';
    case 'agronomo': return 'Agrônomo';
    case 'tecnico': return 'Técnico Agrícola';
    case 'consultor': return 'Consultor';
    case 'estudante': return 'Estudante';
    default: return role;
  }
}
