export interface ViaCEPResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  ibge: string;
  gia: string;
  ddd: string;
  siafi: string;
  erro?: boolean;
}

export async function fetchAddressByCep(cep: string): Promise<Partial<{ street: string; neighborhood: string; city: string; state: string }>> {
  const cleanCep = cep.replace(/\D/g, '');
  if (cleanCep.length !== 8) return {};

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
    const data: ViaCEPResponse = await response.json();

    if (data.erro) {
      return {};
    }

    return {
      street: data.logradouro,
      neighborhood: data.bairro,
      city: data.localidade,
      state: data.uf,
    };
  } catch (error) {
    console.error('Error fetching CEP:', error);
    return {};
  }
}
