"""
Teste direto da conexão InfluxDB para debug
"""
import sys
import os
sys.path.append(os.path.dirname(__file__))

from influxdb_client import InfluxDBClient
from config import Config
from datetime import datetime

def test_influxdb_direct():
    """Teste direto da conexão InfluxDB"""
    print("🔍 TESTE DIRETO INFLUXDB 2.7")
    print("=" * 50)
    
    # Configurações
    url = Config.INFLUXDB_URL
    token = Config.INFLUXDB_TOKEN  
    org = Config.INFLUXDB_ORG
    bucket = Config.INFLUXDB_BUCKET
    
    print(f"📍 URL: {url}")
    print(f"🏢 Org: {org}")
    print(f"🪣 Bucket: {bucket}")
    print(f"🔑 Token: {token[:20]}...")
    print("-" * 50)
    
    try:
        # Conectar ao InfluxDB
        with InfluxDBClient(url=url, token=token, org=org) as client:
            
            # 1. Teste de saúde
            print("🩺 Testando saúde da conexão...")
            health = client.health()
            print(f"   Status: {health.status}")
            print(f"   Versão: {health.version}")
            
            # 2. Listar buckets disponíveis
            print("\n🪣 Buckets disponíveis:")
            buckets_api = client.buckets_api()
            buckets = buckets_api.find_buckets()
            for b in buckets.buckets:
                print(f"   - {b.name} (org: {b.org_id})")
            
            # 3. Verificar se bucket existe
            target_bucket = buckets_api.find_bucket_by_name(bucket)
            if target_bucket:
                print(f"✅ Bucket '{bucket}' encontrado!")
            else:
                print(f"❌ Bucket '{bucket}' NÃO encontrado!")
                return
            
            # 4. Consultar dados no bucket
            print(f"\n📊 Consultando dados no bucket '{bucket}'...")
            query_api = client.query_api()
            
            # Query simples para listar measurements
            query_measurements = f'''
            import "influxdata/influxdb/schema"
            schema.measurements(bucket: "{bucket}")
            '''
            
            print("🔍 Buscando measurements...")
            try:
                result = query_api.query(query_measurements)
                measurements = []
                for table in result:
                    for record in table.records:
                        measurements.append(record["_value"])
                
                if measurements:
                    print(f"   Measurements encontrados: {measurements}")
                else:
                    print("   ❌ Nenhum measurement encontrado")
                    
            except Exception as e:
                print(f"   ❌ Erro ao buscar measurements: {str(e)}")
            
            # 5. Query para buscar qualquer dado recente
            print("\n🔍 Buscando dados dos últimos 24h...")
            query_all_data = f'''
            from(bucket: "{bucket}")
              |> range(start: -24h)
              |> limit(n: 10)
            '''
            
            try:
                result = query_api.query(query_all_data)
                records_found = 0
                
                for table in result:
                    for record in table.records:
                        records_found += 1
                        print(f"   Record {records_found}:")
                        print(f"     Time: {record.get_time()}")
                        print(f"     Measurement: {record.get_measurement()}")
                        print(f"     Field: {record.get_field()}")
                        print(f"     Value: {record.get_value()}")
                        print(f"     Tags: {record.values}")
                        print()
                        
                        if records_found >= 5:  # Limitar saída
                            break
                    if records_found >= 5:
                        break
                
                if records_found == 0:
                    print("   ❌ Nenhum dado encontrado nos últimos 24h")
                else:
                    print(f"   ✅ {records_found} registros encontrados")
                    
            except Exception as e:
                print(f"   ❌ Erro ao buscar dados: {str(e)}")
            
            # 6. Teste de escrita
            print("\n✍️ Testando escrita no InfluxDB...")
            write_api = client.write_api()
            
            test_point = f'''
            test_measurement,source=debug_test value=1.0 {int(datetime.now().timestamp() * 1000000000)}
            '''
            
            try:
                write_api.write(bucket=bucket, org=org, record=test_point)
                print("   ✅ Escrita de teste bem-sucedida!")
                
                # Verificar se o dado foi escrito
                print("   🔍 Verificando dado escrito...")
                query_test = f'''
                from(bucket: "{bucket}")
                  |> range(start: -1m)
                  |> filter(fn: (r) => r["_measurement"] == "test_measurement")
                '''
                
                result = query_api.query(query_test)
                found_test = False
                for table in result:
                    for record in table.records:
                        found_test = True
                        print(f"   ✅ Dado de teste encontrado: {record.get_value()}")
                        break
                    if found_test:
                        break
                
                if not found_test:
                    print("   ❌ Dado de teste não encontrado após escrita")
                    
            except Exception as e:
                print(f"   ❌ Erro na escrita de teste: {str(e)}")
            
            print("\n" + "=" * 50)
            print("🎯 TESTE CONCLUÍDO")
            
    except Exception as e:
        print(f"❌ Erro geral na conexão: {str(e)}")
        import traceback
        print(f"Stack trace: {traceback.format_exc()}")

if __name__ == "__main__":
    test_influxdb_direct()