import { useEffect, useState } from 'react';
import type { VariantSpecGroupView } from '../lib/productVariants.ts';

interface ProductOptionSelectorProps {
  groups: VariantSpecGroupView[];
  onSelect: (specKey: string, specValue: string) => void;
}

/**
 * 面向用户的商品版本选择器：默认只展示当前规格值，点击后展开候选项，选中后自动收起。
 */
export function ProductOptionSelector({ groups, onSelect }: ProductOptionSelectorProps) {
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);

  useEffect(() => {
    if (expandedGroupKey == null) {
      return;
    }
    if (!groups.some((group) => group.key === expandedGroupKey)) {
      setExpandedGroupKey(null);
    }
  }, [expandedGroupKey, groups]);

  return (
    <div className="detail-options__grid">
      {groups.map((group) => {
        const selectedValue = group.values.find((value) => value.selected) ?? group.values[0] ?? null;
        const expanded = expandedGroupKey === group.key;

        return (
          <div key={group.key} className="detail-options__group">
            <span>{group.label}</span>
            <div className={`detail-option-select${expanded ? ' detail-option-select--open' : ''}`}>
              <button
                className="detail-option-select__trigger"
                type="button"
                onClick={() => setExpandedGroupKey((current) => (current === group.key ? null : group.key))}
              >
                <strong>{selectedValue?.value ?? group.selected_value ?? '暂无可选项'}</strong>
                <span className="detail-option-select__chevron" aria-hidden="true">
                  ▾
                </span>
              </button>

              {expanded ? (
                <div className="detail-option-select__panel">
                  {group.values.map((value) => (
                    <button
                      key={`${group.key}-${value.value}`}
                      className={`detail-option-select__item${value.selected ? ' detail-option-select__item--selected' : ''}${!value.selectable ? ' detail-option-select__item--disabled' : ''}`}
                      type="button"
                      disabled={!value.selectable}
                      onClick={() => {
                        onSelect(group.key, value.value);
                        setExpandedGroupKey(null);
                      }}
                    >
                      {value.value}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
